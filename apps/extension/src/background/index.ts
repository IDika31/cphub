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
        // Trigger sync in content script, then open CPHub
        chrome.tabs.sendMessage(tab.id, { type: MESSAGE_TYPES.SYNC_PROBLEM });
        // Wait briefly for sync to complete, then open problems page
        setTimeout(() => {
          chrome.tabs.create({ url: "http://localhost:3000/problems" });
        }, 1500);
      } else {
        // Not on a problem page — just open dashboard
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
