import { logger } from "../shared/logger";
import { MESSAGE_TYPES, type Message } from "../shared/messages";
import type { SyncPayload } from "../shared/api";
import { handleMessage } from "./handler";
import { registerAlarms, handleAlarm } from "./alarm";

chrome.runtime.onInstalled.addListener(() => {
  logger.info("Extension installed/updated");
  registerAlarms();
  chrome.contextMenus.create({
    id: "sync-problem",
    title: "Sync this problem to CPHub",
    contexts: ["page"],
    documentUrlPatterns: [
      "https://codeforces.com/problemset/problem/*",
      "https://codeforces.com/contest/*/problem/*",
      "https://tlx.toki.id/problems/*",
    ],
  });
});

const WEB_BASE = "http://localhost:3000";

function openTLXImport(tlxUrl: string) {
  chrome.tabs.create({
    url: `${WEB_BASE}/problems/import?url=${encodeURIComponent(tlxUrl)}`,
  });
}

chrome.runtime.onMessage.addListener(
  (message: Message<SyncPayload>, _sender, sendResponse) => {
    // TLX import is web-mediated: open the CPHub import route which calls
    // import-tlx server-side using the user's stored token.
    if (message.type === MESSAGE_TYPES.OPEN_TLX_IMPORT) {
      const url = (message.payload as { url?: string } | undefined)?.url;
      if (url) {
        openTLXImport(url);
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: "Missing TLX url" });
      }
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
    chrome.tabs.create({ url: "http://localhost:3000" });
  }
  if (command === "open-editor") {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab?.url || !tab?.id) return;
      const url = tab.url;
      const isCF = url.includes("codeforces.com");
      const isTLX = url.includes("tlx.toki.id");

      if (isTLX) {
        // Web-mediated import: open CPHub import route with the TLX problem URL.
        openTLXImport(url);
        return;
      }

      if (isCF) {
        // Trigger sync first
        chrome.tabs.sendMessage(tab.id, { type: MESSAGE_TYPES.SYNC_PROBLEM });
        // Extract CF problem ID from URL for direct editor link
        const cfMatch = url.match(/codeforces\.com\/contest\/(\d+)\/problem\/([A-Z]\d*)/) || url.match(/codeforces\.com\/problemset\/problem\/(\d+)\/([A-Z]\d*)/);
        const cfId = cfMatch ? `${cfMatch[1]}${cfMatch[2]}` : "";
        const editorUrl = cfId
          ? `${WEB_BASE}/problems/${cfId}`
          : `${WEB_BASE}/problems?provider=codeforces`;
        chrome.tabs.create({ url: editorUrl });
      } else {
        chrome.tabs.create({ url: `${WEB_BASE}/dashboard` });
      }
    });
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "sync-problem" && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: MESSAGE_TYPES.SYNC_PROBLEM });
  }
});
