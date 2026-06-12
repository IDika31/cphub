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

chrome.runtime.onMessage.addListener(
  (message: Message<SyncPayload>, _sender, sendResponse) => {
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

      if (isCF || isTLX) {
        // Trigger sync first
        chrome.tabs.sendMessage(tab.id, { type: MESSAGE_TYPES.SYNC_PROBLEM });
        // Extract CF problem ID from URL for direct editor link
        const cfMatch = url.match(/codeforces\.com\/(?:contest|problemset)\/(?:problem\/)?(\d+)\/(\w+)/);
        const cfId = cfMatch ? `${cfMatch[1]}${cfMatch[2]}` : "";
        // Open CPHub — use provider filter so problem appears at top
        const provider = isCF ? "codeforces" : "tlx";
        // Open editor directly with natural problem ID (e.g., "2234G")
        const editorUrl = cfId
          ? `http://localhost:3000/problems/${cfId}`
          : `http://localhost:3000/problems?provider=${provider}`;
        chrome.tabs.create({ url: editorUrl });
      } else {
        chrome.tabs.create({ url: "http://localhost:3000/dashboard" });
      }
    });
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "sync-problem" && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: MESSAGE_TYPES.SYNC_PROBLEM });
  }
});
