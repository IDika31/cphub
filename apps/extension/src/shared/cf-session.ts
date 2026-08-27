/**
 * Codeforces, driven from the user's own browser.
 *
 * Why this exists: codeforces.com sits behind a Cloudflare managed challenge, and
 * the cf_clearance cookie that clears it is bound to the IP *and* User-Agent that
 * earned it. The server cannot borrow the user's clearance, and earning its own
 * costs a headless Chrome (measured on the production box: 432 MB peak PSS, 152 MB
 * off MemAvailable, 192 MB swapped per solve, on a machine with 892 MB total).
 *
 * The user's browser already has both a logged-in session and a valid clearance, so
 * every request made from here needs neither. That is the whole point of this file.
 *
 * Two things are deliberately NOT sent to the server:
 *   - cf_clearance — useless off this IP, and a token worth not copying around.
 *   - the password — the user types it into Codeforces' own page, never into CPHub.
 */

import { logger } from "./logger";

export const CF_ORIGIN = "https://codeforces.com";

/** Cookies not worth forwarding: analytics noise, and the IP-bound clearance. */
const SKIP_COOKIE = /^(_ga|_gid|_gat|__utm|cf_clearance$|cf_chl|__cf_bm$)/;

export interface CFCookie {
  name: string;
  value: string;
}

export interface CFSessionSnapshot {
  handle: string;
  cookies: CFCookie[];
  /** ftaa/bfaa are the fingerprint pair Codeforces ties to a session. Empty when
   *  the page did not expose them; the server then falls back to its own. */
  ftaa: string;
  bfaa: string;
}

/** What one poll of a Codeforces tab can tell us. */
interface LoginProbe {
  handle: string;
  hasLoginForm: boolean;
  ftaa: string;
  bfaa: string;
}

/**
 * probeLoginState runs inside the page. It must stay self-contained — executeScript
 * serialises the function, so it cannot close over anything in this module.
 *
 * The handle is read by anchoring on the logout link, which is the only element that
 * exists exclusively on a logged-in page, and then taking the nearest /profile/ link
 * to it.
 *
 * The obvious-looking anchor, .enter-or-register-box, is wrong: measured on a real
 * logged-in codeforces.com page it does not exist at all — it is the logged-OUT
 * header. Code that looked for it therefore fell through to "the first /profile/ link
 * in the document", and that page also lists rated users (Benq, jiangly, …) in its
 * sidebar. Measured order was IDika, IDika, IDika, Benq, jiangly — so the old rule
 * was a coin flip that happened to land right, and would have linked a stranger's
 * handle the day Codeforces reordered its markup.
 */
function probeLoginState(): LoginProbe {
  const readInput = (name: string): string => {
    const el = document.querySelector(`input[name="${name}"]`) as HTMLInputElement | null;
    return el?.value ?? "";
  };

  const logout = document.querySelector('a[href*="/logout"], a.logout');
  let handle = "";
  if (logout) {
    let node: Element | null = logout.parentElement;
    for (let depth = 0; depth < 5 && node && !handle; depth++) {
      const profile = node.querySelector('a[href^="/profile/"]');
      if (profile) {
        handle = decodeURIComponent((profile.getAttribute("href") ?? "").split("/")[2] ?? "");
      }
      node = node.parentElement;
    }
  }

  return {
    handle,
    hasLoginForm: !!document.querySelector('input[name="handleOrEmail"]'),
    ftaa: readInput("ftaa"),
    bfaa: readInput("bfaa"),
  };
}

async function probe(tabId: number): Promise<LoginProbe | null> {
  // This one only reads the DOM, which both worlds can do, so ISOLATED is a genuine
  // fallback rather than a degraded one — it is here for pages whose CSP refuses
  // MAIN-world injection.
  for (const world of ["MAIN", "ISOLATED"] as const) {
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId },
        func: probeLoginState,
        world,
      });
      const probed = result?.result as LoginProbe | undefined;
      if (probed) return probed;
    } catch {
      // The tab is mid-navigation, was closed, or refused this world. None is worth
      // raising: the caller polls again.
    }
  }
  return null;
}

/** Cookies for codeforces.com, minus the ones the server must not or cannot use. */
export async function readCFCookies(): Promise<CFCookie[]> {
  const all = await chrome.cookies.getAll({ domain: "codeforces.com" });
  const seen = new Set<string>();
  const out: CFCookie[] = [];
  for (const c of all) {
    if (SKIP_COOKIE.test(c.name) || !c.value) continue;
    // getAll returns one entry per (name, domain, path); the session cookie is the
    // same value on every path, so the first wins and the rest are duplicates.
    if (seen.has(c.name)) continue;
    seen.add(c.name);
    out.push({ name: c.name, value: c.value });
  }
  return out;
}

/** Is there a Codeforces session in this browser right now? Cheap: no tab opened. */
export async function peekCFSession(): Promise<{ loggedIn: boolean }> {
  // Deliberately NOT keyed on JSESSIONID: Codeforces issues one to anonymous
  // visitors too, so its presence says only that the site has been opened. "X-User"
  // is set by remember-me and belongs to a signed-in account, which makes it the one
  // signal readable without loading a page. A false negative here is harmless —
  // ensureCFLogin loads the page and finds out for certain — while a false positive
  // would tell the user they are connected when they are not.
  const remember = await chrome.cookies.get({ url: CF_ORIGIN, name: "X-User" });
  return { loggedIn: !!remember?.value };
}

export class CFLoginCancelled extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CFLoginCancelled";
  }
}

/** How long to let Codeforces finish setting cookies after the logged-in page first
 *  appears. The logout link renders as soon as the HTML lands, but remember-me
 *  ("X-User") can arrive on a Set-Cookie of that same response or the redirect after
 *  it — reading the jar the instant the link appears can therefore miss it. */
const COOKIE_SETTLE_MS = 700;

/**
 * ensureCFLogin opens Codeforces' own login page and resolves once someone is signed
 * in — immediately if they already were, otherwise after the user logs in by hand.
 *
 * The tab is opened focused because the user has to type into it, and it is closed
 * again the moment login is detected, so "connect my account" ends where it started.
 * That close is unconditional once login is seen: a session that was captured but
 * whose cookies could not be read is still a successful login, and leaving the tab
 * behind to signal a failure the user cannot act on only looks broken.
 *
 * A user who closes the tab themselves has cancelled, which is reported as such
 * rather than as a timeout.
 */
export async function ensureCFLogin(opts: { timeoutMs?: number } = {}): Promise<CFSessionSnapshot> {
  const timeoutMs = opts.timeoutMs ?? 5 * 60_000;

  // Remember where the user was, because that is where they expect to end up. Closing a
  // tab hands focus to whatever Chrome considers adjacent, which after a login started
  // from CPHub is usually some unrelated tab — the user then has to hunt for the page
  // that is waiting on the result.
  const [opener] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Opened immediately to the right of the opener rather than at the end of the strip,
  // so the login tab reads as belonging to the page that asked for it.
  const tab = await chrome.tabs.create({
    url: `${CF_ORIGIN}/enter`,
    active: true,
    ...(opener?.index !== undefined ? { index: opener.index + 1, windowId: opener.windowId } : {}),
  });
  const tabId = tab.id;
  if (tabId === undefined) throw new Error("Tidak bisa membuka tab Codeforces");

  // closedByTool is set before we close the tab ourselves, so our own removal is not
  // mistaken for the user walking away — the listener cannot tell the two apart.
  let closedByTool = false;
  let closedByUser = false;
  const onRemoved = (id: number) => {
    if (id === tabId && !closedByTool) closedByUser = true;
  };
  chrome.tabs.onRemoved.addListener(onRemoved);

  const closeTab = async () => {
    closedByTool = true;
    try {
      await chrome.tabs.remove(tabId);
    } catch {
      /* already gone */
    }
    // Hand focus back. Best effort on purpose: the user may have closed that tab, or
    // navigated it elsewhere, and failing to refocus is not a reason to fail a login
    // that already succeeded.
    if (opener?.id === undefined) return;
    try {
      await chrome.tabs.update(opener.id, { active: true });
      if (opener.windowId !== undefined) {
        await chrome.windows.update(opener.windowId, { focused: true });
      }
    } catch {
      /* the tab the user came from is gone */
    }
  };

  const deadline = Date.now() + timeoutMs;
  try {
    let sawForm = false;
    while (Date.now() < deadline) {
      if (closedByUser) {
        throw new CFLoginCancelled(
          sawForm
            ? "Login dibatalkan — tab Codeforces ditutup sebelum login selesai"
            : "Tab Codeforces ditutup sebelum halaman login terbaca",
        );
      }

      const state = await probe(tabId);
      if (state?.handle) {
        await sleep(COOKIE_SETTLE_MS);
        const cookies = await readCFCookies();
        await closeTab();
        if (!cookies.length) {
          throw new Error("Login terbaca tapi tidak ada cookie Codeforces yang bisa dibaca");
        }
        logger.info(`Codeforces session captured for ${state.handle} (${cookies.length} cookies)`);
        return { handle: state.handle, cookies, ftaa: state.ftaa, bfaa: state.bfaa };
      }
      if (state?.hasLoginForm) sawForm = true;

      await sleep(1000);
    }
    throw new CFLoginCancelled(
      sawForm
        ? "Waktu login habis — form login terbuka tapi login tidak selesai"
        : "Waktu habis menunggu halaman login Codeforces",
    );
  } finally {
    chrome.tabs.onRemoved.removeListener(onRemoved);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
