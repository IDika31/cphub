import { logger } from "../shared/logger";
import { MESSAGE_TYPES, type Message } from "../shared/messages";
import { syncToAPI, type SyncPayload } from "../shared/api";
import { pushToOfflineQueue, incrementSyncedCount } from "../shared/storage";
import { updateBadge } from "./badge";

chrome.runtime.onInstalled.addListener(() => {
  logger.info("Extension installed/updated");
  chrome.alarms.create("health-ping", { periodInMinutes: 5 });
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
    return true; // async response
  },
);

async function handleMessage(
  message: Message<SyncPayload>,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  switch (message.type) {
    case MESSAGE_TYPES.SYNC_PROBLEM:
    case MESSAGE_TYPES.SYNC_SUBMISSION:
    case MESSAGE_TYPES.SYNC_PROFILE: {
      if (!message.payload) {
        return { success: false, error: "Missing payload" };
      }
      try {
        const result = await syncToAPI(message.payload);
        await incrementSyncedCount();
        await updateBadge("success");
        return { success: true, data: result };
      } catch (err) {
        logger.error("Sync failed, queuing offline", err);
        await pushToOfflineQueue(message.payload);
        await updateBadge("error");
        return {
          success: false,
          error: (err as Error).message,
        };
      }
    }
    case MESSAGE_TYPES.GET_STATUS: {
      const syncedCount = await (await import("../shared/storage")).getSyncedCount();
      return {
        success: true,
        data: {
          syncedCount,
          extensionVersion: chrome.runtime.getManifest().version,
        },
      };
    }
    default:
      return { success: false, error: `Unknown message type: ${message.type}` };
  }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "health-ping") {
    try {
      const { pingAPI } = await import("../shared/api");
      await pingAPI();
      await updateBadge("ok");
    } catch {
      await updateBadge("error");
    }
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "sync-current-problem") {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: MESSAGE_TYPES.SYNC_PROBLEM,
      });
    }
  }
  if (command === "open-dashboard") {
    chrome.tabs.create({ url: "http://localhost:3000" });
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "sync-problem" && tab?.id) {
    chrome.tabs.sendMessage(tab.id, {
      type: MESSAGE_TYPES.SYNC_PROBLEM,
    });
  }
});
