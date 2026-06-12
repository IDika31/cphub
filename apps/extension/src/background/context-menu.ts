import { MESSAGE_TYPES } from "../shared/messages";
import { logger } from "../shared/logger";

export function createContextMenus(): void {
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
}

export function handleContextMenuClick(
  info: chrome.contextMenus.OnClickData,
  tab?: chrome.tabs.Tab,
): void {
  if (info.menuItemId === "sync-problem" && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: MESSAGE_TYPES.SYNC_PROBLEM });
    logger.info("Context menu: sync triggered");
  }
}
