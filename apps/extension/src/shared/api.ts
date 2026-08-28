import { generateHMAC } from "./crypto";
import type { CFContestState } from "./cf-contests";
import { getSetting } from "./storage";

/**
 * Where an unconfigured extension points.
 *
 * The values come from the build, not from this file: see src/vite-env.d.ts for why, and
 * deploy/push.sh for where the server supplies them. localhost remains the fallback so a
 * plain `bun run build` still produces a development extension.
 *
 * Exported because the Options page shows them as its initial field values, and two
 * copies of a default is how a default starts lying.
 */
export const DEFAULT_API_URL = import.meta.env.VITE_CPHUB_API_URL || "http://localhost:3001";
export const DEFAULT_WEB_URL = import.meta.env.VITE_CPHUB_WEB_URL || "http://localhost:3000";

export interface SyncPayload {
  provider: "codeforces" | "tlx";
  type: "problem" | "submission" | "profile";
  url: string;
  data: Record<string, unknown>;
}

export interface SyncResponse {
  status: "ok" | "error";
  message?: string;
}

async function getApiUrl(): Promise<string> {
  const url = await getSetting("apiUrl");
  return url || DEFAULT_API_URL;
}

// The dashboard lives on a different origin from the API in most deployments,
// so "open this problem in CPHub" needs its own base. Trailing slashes are
// stripped because every caller concatenates a path onto it.
export async function getWebUrl(): Promise<string> {
  const url = await getSetting("webUrl");
  return (url || DEFAULT_WEB_URL).replace(/\/+$/, "");
}

export interface ExtensionKey {
  keyId: string;
  secret: string;
}

// CPHub Settings hands out one string: "<account id>.<secret>". Each account has
// its own secret, so pairing is per user and one leaked token is scoped to one
// account. Splitting it here keeps pairing to a single copy-paste.
export function parsePairingToken(token: string): ExtensionKey | null {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const keyId = token.slice(0, dot).trim();
  const secret = token.slice(dot + 1).trim();
  return keyId && secret ? { keyId, secret } : null;
}

async function getExtensionKey(): Promise<ExtensionKey | null> {
  const token = await getSetting("pairingToken");
  return token ? parsePairingToken(token) : null;
}

export class HttpError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "HttpError";
  }
}

export async function syncToAPI(payload: SyncPayload): Promise<SyncResponse> {
  const apiUrl = await getApiUrl();
  const key = await getExtensionKey();
  if (!key) {
    throw new Error("Extension not paired — copy the pairing token from CPHub Settings into the extension Settings tab");
  }

  const body = JSON.stringify(payload);
  const endpoint = payload.type === "problem" ? "/api/sync/problem" : "/api/sync/submission";
  let retries = 3;
  let lastError: Error | null = null;

  while (retries > 0) {
    // Generate fresh nonce + signature per retry
    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const signature = await generateHMAC(body, key.secret);

    try {
      const res = await fetch(`${apiUrl}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Key-Id": key.keyId,
          "X-HMAC-Signature": signature,
          "X-Nonce": nonce,
        },
        body,
      });

      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({}));
        const message = (errorBody as { error?: string }).error || `HTTP ${res.status}`;
        throw new HttpError(message, res.status);
      }

      return (await res.json()) as SyncResponse;
    } catch (err) {
      lastError = err as Error;
      // Don't retry client errors (4xx) — bad data won't succeed on retry
      if (err instanceof HttpError && err.status >= 400 && err.status < 500) {
        break;
      }
      retries--;
      if (retries > 0) {
        await new Promise((r) => setTimeout(r, 1000 * (3 - retries)));
      }
    }
  }

  throw lastError || new Error("Sync failed after retries");
}

export async function pingAPI(): Promise<{ status: string; latencyMs: number }> {
  const apiUrl = await getApiUrl();
  const start = performance.now();
  const res = await fetch(`${apiUrl}/api/health`);
  const end = performance.now();
  return {
    status: res.ok ? "ok" : "error",
    latencyMs: Math.round(end - start),
  };
}

/** Hands CPHub the Codeforces session this browser just captured, so the server can
 *  act on the account when the extension is not around to do it itself.
 *
 *  What travels: the Codeforces identity cookies and the ftaa/bfaa pair. What does
 *  not: the password (never seen — the user types it into Codeforces' own page) and
 *  cf_clearance (Cloudflare binds it to this IP, so the server cannot use it). */
export async function pushCFSession(snapshot: {
  handle: string;
  cookies: Array<{ name: string; value: string }>;
  ftaa: string;
  bfaa: string;
}): Promise<{ handle: string; rating?: number }> {
  const key = await getExtensionKey();
  if (!key) {
    throw new Error("Extension belum dipasangkan — tempel pairing token dari CPHub Settings");
  }
  const apiUrl = await getApiUrl();
  const body = JSON.stringify(snapshot);
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const signature = await generateHMAC(body, key.secret);

  const res = await fetch(`${apiUrl}/api/sync/cf-session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Key-Id": key.keyId,
      "X-HMAC-Signature": signature,
      "X-Nonce": nonce,
    },
    body,
  });
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    const message = (errorBody as { error?: string }).error || `HTTP ${res.status}`;
    throw new HttpError(message, res.status);
  }
  return (await res.json()) as { handle: string; rating?: number };
}

/** What the server did with the states it was handed. `unknown` are the rows whose state
 *  the page did not state — counted rather than dropped silently, because a sync that
 *  suddenly understands nothing is a markup change worth seeing in the log. */
export interface ContestStateReceipt {
  seen: number;
  registered: number;
  cleared: number;
  unknown: number;
  windows: number;
}

/** Hands CPHub the registration state this browser read off Codeforces' own contest list.
 *
 *  This is the only accurate source: no Codeforces read API exposes registration, so
 *  without it CPHub can never learn about a round the user joined directly on the site. */
export async function pushContestStates(
  states: CFContestState[],
): Promise<ContestStateReceipt> {
  const key = await getExtensionKey();
  if (!key) {
    throw new Error("Extension belum dipasangkan — tempel pairing token dari CPHub Settings");
  }
  const apiUrl = await getApiUrl();
  const body = JSON.stringify({ states });
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const signature = await generateHMAC(body, key.secret);

  const res = await fetch(`${apiUrl}/api/sync/cf-contest-states`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Key-Id": key.keyId,
      "X-HMAC-Signature": signature,
      "X-Nonce": nonce,
    },
    body,
  });
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    const message = (errorBody as { error?: string }).error || `HTTP ${res.status}`;
    throw new HttpError(message, res.status);
  }
  return (await res.json()) as ContestStateReceipt;
}

/** Hands CPHub a Codeforces problem page read in this browser. The server parses it
 *  with the same parser its own scraper uses — see cf-problem.ts for why the fetch
 *  happens here rather than there. */
export async function pushProblemStatement(
  problemId: string,
  url: string,
  html: string,
): Promise<{ problemId: string; title: string; samples: number }> {
  const key = await getExtensionKey();
  if (!key) {
    throw new Error("Extension belum dipasangkan — tempel pairing token dari CPHub Settings");
  }
  const apiUrl = await getApiUrl();
  const body = JSON.stringify({ problemId, url, html });
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const signature = await generateHMAC(body, key.secret);

  const res = await fetch(`${apiUrl}/api/sync/cf-statement`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Key-Id": key.keyId,
      "X-HMAC-Signature": signature,
      "X-Nonce": nonce,
    },
    body,
  });
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new HttpError((errorBody as { error?: string }).error || `HTTP ${res.status}`, res.status);
  }
  return (await res.json()) as { problemId: string; title: string; samples: number };
}

/** Custom Judgels/TLX hosts the user added in the extension. Pushed to CPHub so
 *  each one gets its own Connections entry instead of being invisible to the
 *  dashboard — the list is authoritative, so removing a host here unlinks it. */
export async function pushCustomTLXHosts(
  hosts: Array<{ host: string; apiHost?: string; name?: string }>,
): Promise<void> {
  const key = await getExtensionKey();
  if (!key) return; // not paired yet — nothing to attribute the hosts to

  const apiUrl = await getApiUrl();
  const body = JSON.stringify({ hosts });
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const signature = await generateHMAC(body, key.secret);

  const res = await fetch(`${apiUrl}/api/sync/tlx-hosts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Key-Id": key.keyId,
      "X-HMAC-Signature": signature,
      "X-Nonce": nonce,
    },
    body,
  });
  if (!res.ok) {
    throw new HttpError(`Failed to register custom TLX hosts (HTTP ${res.status})`, res.status);
  }
}
