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
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "sync-problem" && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: MESSAGE_TYPES.SYNC_PROBLEM });
  }
});
