/**
 * Driving a Codeforces page from a background tab.
 *
 * Shared by everything that has to act on codeforces.com rather than just read it —
 * submitting, registering, reading the contest list. All of it works the same way and for
 * the same reason: a request made from a real codeforces.com tab is same-origin, so the
 * session cookie is attached by the browser with no SameSite argument to lose, the
 * Cloudflare clearance is already valid for this IP, and any csrf token or hidden field
 * is read from the very page that issued it.
 *
 * A background tab rather than a service-worker fetch on purpose: an extension-origin
 * fetch is cross-site as far as SameSite cookies are concerned, so the session would not
 * reliably travel with it.
 */

import { CF_ORIGIN } from "./cf-session";

/** What an injected function hands back. Errors travel as data, because an exception
 *  thrown inside an injected function does not cross the executeScript boundary. */
export interface PageResult<T> {
  ok: boolean;
  error?: string;
  data?: T;
}

/** Opens a Codeforces URL in a background tab and resolves once it has loaded. */
export async function openBackgroundTab(path: string): Promise<number> {
  const tab = await chrome.tabs.create({ url: CF_ORIGIN + path, active: false });
  const tabId = tab.id;
  if (tabId === undefined) throw new Error("Tidak bisa membuka tab Codeforces");

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error(`Halaman ${path} tidak selesai dimuat`));
    }, 60_000);
    const listener = (id: number, info: chrome.tabs.TabChangeInfo) => {
      if (id !== tabId || info.status !== "complete") return;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
  return tabId;
}

export async function closeTab(tabId: number): Promise<void> {
  try {
    await chrome.tabs.remove(tabId);
  } catch {
    /* already gone */
  }
}

/**
 * runInTab injects a function into a Codeforces tab and returns what it reports.
 *
 * MAIN first, and it matters: a fetch from the MAIN world carries the page's own origin,
 * so the session cookie travels with it and SameSite has no complaint. An ISOLATED-world
 * fetch is attributed to the extension instead, where a SameSite cookie may be withheld.
 *
 * ISOLATED is still tried as a fallback, because a page's CSP can refuse MAIN-world
 * injection outright and a refusal there would otherwise look like a broken action.
 */
export async function runInTab<T, A>(
  tabId: number,
  func: (arg: A) => PageResult<T> | Promise<PageResult<T>>,
  arg: A,
): Promise<T> {
  let result: PageResult<T> | undefined;
  let lastErr: Error | null = null;
  for (const world of ["MAIN", "ISOLATED"] as const) {
    try {
      const [injected] = await chrome.scripting.executeScript({
        target: { tabId },
        world,
        func: func as (...args: unknown[]) => unknown,
        args: [arg as unknown],
      });
      result = injected?.result as PageResult<T> | undefined;
      if (result) break;
    } catch (err) {
      lastErr = err as Error;
    }
  }
  if (!result) {
    throw new Error(
      lastErr
        ? `Tidak bisa menjalankan skrip di halaman Codeforces: ${lastErr.message}`
        : "Tidak ada balasan dari halaman Codeforces",
    );
  }
  if (!result.ok) throw new Error(result.error || "Codeforces menolak permintaan");
  return result.data as T;
}

/** Runs `func` against `path` and closes the tab again, whatever the outcome. */
export async function inCodeforcesTab<T, A>(
  path: string,
  func: (arg: A) => PageResult<T> | Promise<PageResult<T>>,
  arg: A,
): Promise<T> {
  const tabId = await openBackgroundTab(path);
  try {
    return await runInTab(tabId, func, arg);
  } finally {
    await closeTab(tabId);
  }
}
