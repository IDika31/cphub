import { logger } from "../shared/logger";
import { MESSAGE_TYPES, type Message, type MessageResponse } from "../shared/messages";
import { getWebUrl, pushCustomTLXHosts, type SyncPayload } from "../shared/api";
import { handleMessage } from "./handler";
import { registerAlarms, handleAlarm } from "./alarm";

const DEFAULT_TLX_HOSTS = ["tlx.toki.id"];
let tlxHosts: string[] = DEFAULT_TLX_HOSTS;
let tlxApiHostMap: Record<string, string> = {};

async function loadTlxHosts(): Promise<void> {
  let custom: { host: string; apiHost?: string; name?: string }[] = [];
  try {
    const result = await chrome.storage.sync.get("customTlxHosts");
    custom = result.customTlxHosts ?? [];
    tlxHosts = [...DEFAULT_TLX_HOSTS, ...custom.map((c) => c.host)];
    tlxApiHostMap = {};
    for (const c of custom) {
      if (c.apiHost) tlxApiHostMap[c.host] = c.apiHost;
    }
  } catch {
    tlxHosts = DEFAULT_TLX_HOSTS;
    tlxApiHostMap = {};
    return;
  }
  // Mirror the list into CPHub so each custom instance appears in Connections
  // as its own provider. Best effort: an unpaired or offline extension keeps
  // working locally.
  try {
    await pushCustomTLXHosts(custom);
  } catch (err) {
    logger.warn("Could not register custom TLX hosts with CPHub", err);
  }
}

function isTlxUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return tlxHosts.some((h) => u.hostname === h || u.hostname.endsWith("." + h));
  } catch {
    return false;
  }
}

function isTlxProblemUrl(url: string): boolean {
  return isTlxUrl(url) && (/\/problems\/[^/]+\/[^/]+/.test(url) || /\/contests\/[^/]+\/problems\/[^/]+/.test(url) || /\/courses\/[^/]+\/chapters\/[^/]+\/problems\/[^/]+/.test(url));
}

// Load custom TLX hosts on every service worker startup (not just onInstalled)
loadTlxHosts();

chrome.runtime.onInstalled.addListener(async () => {
  logger.info("Extension installed/updated");
  registerAlarms();
  await loadTlxHosts();
  chrome.contextMenus.create({
    id: "sync-problem",
    title: "Sync this problem to CPHub",
    contexts: ["page"],
    documentUrlPatterns: [
      "https://codeforces.com/problemset/problem/*",
      "https://codeforces.com/contest/*/problem/*",
      "https://tlx.toki.id/problems/*",
      "https://tlx.toki.id/contests/*/problems/*",
      "https://tlx.toki.id/courses/*/chapters/*/problems/*",
      ...tlxHosts.filter((h) => h !== "tlx.toki.id").flatMap((h) => [
        `https://${h}/problems/*`,
        `https://${h}/contests/*/problems/*`,
        `https://${h}/courses/*/chapters/*/problems/*`,
      ]),
    ],
  });
});

/**
 * beside places a new tab immediately to the right of the one it came from, instead of
 * at the end of the strip where Chrome puts it by default. Opening the editor five tabs
 * away from the problem it belongs to is the kind of small friction that adds up.
 *
 * windowId travels with the index deliberately: an index alone is interpreted in the
 * *current* window, so a command fired from a second window would drop the tab in the
 * wrong place. An unknown or already-closed source tab returns nothing and lets Chrome
 * decide, which is the right fallback.
 */
async function beside(tabId?: number): Promise<{ index?: number; windowId?: number }> {
  if (tabId === undefined) return {};
  try {
    const tab = await chrome.tabs.get(tabId);
    return { index: tab.index + 1, windowId: tab.windowId };
  } catch {
    return {};
  }
}

async function openTLXImport(tlxUrl: string, sourceTabId?: number) {
  const webBase = await getWebUrl();
  let importUrl = `${webBase}/problems/import?url=${encodeURIComponent(tlxUrl)}`;
  try {
    const hostname = new URL(tlxUrl).hostname;
    const apiHost = tlxApiHostMap[hostname];
    if (apiHost) importUrl += `&apiHost=${encodeURIComponent(apiHost)}`;
  } catch { /* ignore parse error */ }
  chrome.tabs.create({ url: importUrl, ...(await beside(sourceTabId)) });
}

// Alt+C lands here from two directions: chrome.commands when the shortcut is
// bound, and the OPEN_EDITOR message from the content-script fallback when it is
// not (Brave and Edge routinely drop a suggested_key another extension claimed).
// Both paths share this one function so they can never drift apart.
async function openEditorForTab(url: string, tabId?: number) {
  if (!url) return;
  const webBase = await getWebUrl();
  const placement = await beside(tabId);

  if (isTlxUrl(url)) {
    if (isTlxProblemUrl(url)) {
      await openTLXImport(url, tabId);
    } else {
      chrome.tabs.create({ url: `${webBase}/problems?provider=tlx`, ...placement });
    }
    return;
  }

  if (url.includes("codeforces.com")) {
    // Sync first so the editor has the statement and samples when it opens.
    if (tabId !== undefined) {
      try {
        await chrome.tabs.sendMessage(tabId, { type: MESSAGE_TYPES.SYNC_PROBLEM });
      } catch { /* no content script on this page — the editor still opens */ }
    }
    const cfMatch =
      url.match(/codeforces\.com\/contest\/(\d+)\/problem\/([A-Za-z]\d*)/) ||
      url.match(/codeforces\.com\/problemset\/problem\/(\d+)\/([A-Za-z]\d*)/);
    const cfId = cfMatch ? `${cfMatch[1]}${cfMatch[2].toUpperCase()}` : "";
    chrome.tabs.create({
      url: cfId ? `${webBase}/problems/${cfId}` : `${webBase}/problems?provider=codeforces`,
      ...placement,
    });
    return;
  }

  chrome.tabs.create({ url: `${webBase}/dashboard`, ...placement });
}

chrome.runtime.onMessage.addListener(
  (message: Message<SyncPayload>, sender, sendResponse) => {
    // TLX import is web-mediated: open the CPHub import route which calls
    // import-tlx server-side using the user's stored token.
    if (message.type === MESSAGE_TYPES.OPEN_TLX_IMPORT) {
      const url = (message.payload as { url?: string } | undefined)?.url;
      if (url) {
        openTLXImport(url, sender.tab?.id);
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: "Missing TLX url" });
      }
      return true;
    }

    // Content-script fallback for Alt+C. Without this branch the message fell
    // through to handleMessage(), which does not know the type — so whenever
    // chrome.commands failed to bind the shortcut, Alt+C did nothing at all.
    if (message.type === MESSAGE_TYPES.OPEN_EDITOR) {
      const fromPayload = (message.payload as { url?: string } | undefined)?.url;
      const url = sender.tab?.url || fromPayload || "";
      openEditorForTab(url, sender.tab?.id)
        .then(() => sendResponse({ success: true }))
        .catch((err) => sendResponse({ success: false, error: (err as Error).message }));
      return true;
    }

    handleMessage(message)
      .then((result) => sendResponse(result))
      .catch((err) =>
        sendResponse({ success: false, error: err.message }),
      );
    return true;
  },
);

chrome.alarms.onAlarm.addListener(handleAlarm);

// Port-based bridge for webapp (localhost:3000) — more reliable than sendMessage
// because the open port keeps the service worker alive.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "webapp-bridge") return;
  port.onMessage.addListener(
    async (message: { type: string; payload: unknown; requestId: string }) => {
      let result: MessageResponse;
      try {
        result = await handleMessage({ type: message.type, payload: message.payload as SyncPayload });
      } catch (err) {
        result = { success: false, error: (err as Error).message };
      }
      try { port.postMessage({ ...result, requestId: message.requestId }); } catch { /* port closed */ }
    },
  );
});

// Programmatically inject webapp bridge into localhost:3000 tabs
// (belt-and-suspenders alongside the content_scripts declaration)
function webappBridgeFunc() {
  if ((globalThis as Record<string, unknown>).__cphubBridgeReady) return;
  (globalThis as Record<string, unknown>).__cphubBridgeReady = true;

  const ALLOWED = new Set([
    "CF_LOGIN",
    "CF_SESSION_STATUS",
    "CF_SUBMIT",
    "CF_LANGUAGES",
    "CF_REGISTER",
    "CF_CONTEST_STATES",
    "CF_STATEMENT",
    "CF_STATEMENTS_BATCH",
    "CF_CHECK_VERDICT",
    "PING",
  ]);
  let port: chrome.runtime.Port | null = null;
  const pending = new Map<string, (r: object) => void>();

  function connect() {
    try {
      port = chrome.runtime.connect({ name: "webapp-bridge" });
      port.onMessage.addListener((msg: object & { requestId?: string }) => {
        const cb = pending.get(msg.requestId ?? "");
        if (cb) { pending.delete(msg.requestId!); cb(msg); }
      });
      port.onDisconnect.addListener(() => { port = null; });
    } catch { port = null; }
  }

  connect();

  window.addEventListener("message", (event: MessageEvent) => {
    if (event.source !== window) return;
    const d = (event.data || {}) as { type?: string; payload?: unknown; requestId?: string };
    if (!d.type || !ALLOWED.has(d.type) || !d.requestId) return;

    if (!chrome.runtime?.id) {
      window.postMessage({ type: `${d.type}_RESPONSE`, requestId: d.requestId, success: false, error: "Extension reloaded — please refresh this tab" }, window.location.origin);
      return;
    }

    if (!port) connect();

    if (!port) {
      window.postMessage({ type: `${d.type}_RESPONSE`, requestId: d.requestId, success: false, error: "Extension disconnected — please refresh this tab" }, window.location.origin);
      return;
    }

    pending.set(d.requestId, (response) => {
      window.postMessage({ type: `${d.type}_RESPONSE`, requestId: d.requestId, ...response }, window.location.origin);
    });

    try {
      port.postMessage({ type: d.type, payload: d.payload, requestId: d.requestId });
    } catch {
      pending.delete(d.requestId);
      port = null;
      window.postMessage({ type: `${d.type}_RESPONSE`, requestId: d.requestId, success: false, error: "Extension disconnected — please refresh this tab" }, window.location.origin);
    }
  });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  const url = tab.url || "";
  void getWebUrl().then((webBase) => {
    // Inject the webapp bridge into CPHub web tabs (localhost or configured domain)
    const isWebTab = url.startsWith("http://localhost:3000") ||
      url.startsWith("https://localhost:3000") ||
      url.startsWith(webBase);
    if (isWebTab) {
      chrome.scripting.executeScript({
        target: { tabId },
        func: webappBridgeFunc,
        world: "ISOLATED",
      }).catch(() => {/* tab may have navigated away */});
      return;
    }
    // Inject TLX content script on custom TLX hosts (static manifest handles tlx.toki.id)
    if (isTlxUrl(url) && !url.includes("tlx.toki.id")) {
      chrome.scripting.executeScript({
        target: { tabId },
        files: ["src/content/tlx.ts"],
        world: "ISOLATED",
      }).catch(() => {/* tab may have navigated away */});
    }
  });
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "sync-current-problem") {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: MESSAGE_TYPES.SYNC_PROBLEM });
    }
  }
  if (command === "open-dashboard") {
    chrome.tabs.create({ url: await getWebUrl() });
  }
  if (command === "open-editor") {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) await openEditorForTab(tab.url, tab.id);
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "sync-problem" && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: MESSAGE_TYPES.SYNC_PROBLEM });
  }
});

chrome.storage.sync.onChanged.addListener((changes) => {
  if (changes.customTlxHosts) loadTlxHosts();
});
