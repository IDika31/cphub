/**
 * Talking to the CPHub browser extension from the web app.
 *
 * The extension injects a bridge into CPHub tabs (see webappBridgeFunc in
 * apps/extension/src/background/index.ts) which relays window messages to its service
 * worker and posts the reply back. This is the web half of that contract.
 *
 * It exists because some Codeforces work can only be done in the user's own browser:
 * codeforces.com is behind a Cloudflare managed challenge whose clearance cookie is
 * bound to the IP that earned it, so the user's browser — already logged in, already
 * cleared — is the cheapest and safest place to log in and to submit from.
 */

export class ExtensionMissingError extends Error {
  constructor() {
    super("Extension CPHub tidak terdeteksi di browser ini");
    this.name = "ExtensionMissingError";
  }
}

interface BridgeReply {
  requestId?: string;
  success?: boolean;
  data?: unknown;
  error?: string;
}

/**
 * callExtension sends one request and waits for its matching reply.
 *
 * timeoutMs has to suit the call: a status check answers instantly, while CF_LOGIN
 * waits for a person to type a password and possibly clear a 2FA prompt. A timeout
 * short enough for the former would abandon the latter mid-login.
 */
export function callExtension<T>(type: string, payload?: unknown, timeoutMs = 15_000): Promise<T> {
  if (typeof window === "undefined") return Promise.reject(new ExtensionMissingError());

  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const responseType = `${type}_RESPONSE`;

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      window.removeEventListener("message", onMessage);
      // No reply at all means the bridge was never injected — the extension is
      // missing, disabled, or this tab predates its install. That is a different
      // problem from a call that failed, so it gets its own error type.
      reject(new ExtensionMissingError());
    }, timeoutMs);

    function onMessage(event: MessageEvent) {
      if (event.source !== window) return;
      const d = (event.data ?? {}) as BridgeReply & { type?: string };
      if (d.type !== responseType || d.requestId !== requestId) return;

      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      if (d.success) resolve(d.data as T);
      else reject(new Error(d.error || "Extension gagal memproses permintaan"));
    }

    window.addEventListener("message", onMessage);
    window.postMessage({ type, payload, requestId }, window.location.origin);
  });
}

/** Is the extension installed and reachable in this tab? */
export async function hasExtension(): Promise<boolean> {
  try {
    await callExtension<{ loggedIn: boolean }>("CF_SESSION_STATUS", undefined, 2_500);
    return true;
  } catch {
    return false;
  }
}

/** Opens Codeforces' own login page and resolves once the session is captured and
 *  handed to CPHub. Waits up to six minutes: the user is typing, not the machine. */
export function loginCodeforcesViaExtension(): Promise<{ handle: string; rating?: number }> {
  return callExtension<{ handle: string; rating?: number }>("CF_LOGIN", undefined, 6 * 60_000);
}

export function cfSessionStatusViaExtension(): Promise<{ loggedIn: boolean }> {
  return callExtension<{ loggedIn: boolean }>("CF_SESSION_STATUS", undefined, 5_000);
}

export function fetchCFLanguagesViaExtension(contestId: number): Promise<{ languages: Array<{ id: string; name: string }> }> {
  return callExtension<{ languages: Array<{ id: string; name: string }> }>(
    "CF_LANGUAGES",
    { contestId },
    90_000,
  );
}

/** Registers from the user's browser. `already` distinguishes "you were in this" from
 *  "you are in now". */
export function registerContestViaExtension(contestId: number): Promise<{ registered: boolean; already: boolean }> {
  return callExtension<{ registered: boolean; already: boolean }>("CF_REGISTER", { contestId }, 90_000);
}

/** Reads registration state for every upcoming contest off Codeforces' own list and hands
 *  it to CPHub. One page load, so it covers rounds the user joined directly on the site —
 *  which nothing else can discover.
 *
 *  `registered` is a tri-state: absent means the page stated nothing readable about that
 *  contest, which the server leaves alone rather than treating as a withdrawal. */
export function syncContestStatesViaExtension(): Promise<{
  states: Array<{ contestRef: string; registered?: boolean; registrationOpensAt?: string }>;
  saved: { seen: number; registered: number; cleared: number; unknown: number; windows: number };
}> {
  return callExtension("CF_CONTEST_STATES", undefined, 90_000);
}

/** Submits from the user's browser, where the session and the Cloudflare clearance
 *  both already exist. Generous timeout: it opens a page, posts a form and reads the
 *  reply, all over Codeforces' own latency. */
export function submitCFViaExtension(req: {
  contestId: number;
  problemIndex: string;
  language: string;
  source: string;
}): Promise<{ submitted: boolean; handle: string }> {
  return callExtension<{ submitted: boolean; handle: string }>("CF_SUBMIT", req, 120_000);
}
