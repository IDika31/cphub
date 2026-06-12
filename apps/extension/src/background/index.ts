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
      if (!tab?.url) return;
      const url = tab.url;
      let editorUrl = "http://localhost:3000/problems";
      // Extract CF problem: /contest/123/problem/A or /problemset/problem/123/A
      const cfMatch = url.match(/codeforces\.com\/(?:contest|problemset)\/(?:problem\/)?(\d+)\/(\w+)/);
      if (cfMatch) {
        editorUrl = `http://localhost:3000/problems?cf=${cfMatch[1]}${cfMatch[2]}`;
      }
      // Extract TLX problem: /problems/xxx
      const tlxMatch = url.match(/tlx\.toki\.id\/problems\/([^/?]+)/);
      if (tlxMatch) {
        editorUrl = `http://localhost:3000/problems?tlx=${tlxMatch[1]}`;
      }
      chrome.tabs.create({ url: editorUrl });
    });
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "sync-problem" && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: MESSAGE_TYPES.SYNC_PROBLEM });
  }
});
