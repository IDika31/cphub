import { MESSAGE_TYPES } from "../shared/messages";
import { registerOpenEditorHotkey } from "../shared/hotkey";
import { detectPageType } from "./detector";
import { logger } from "../shared/logger";

// TLX statements are served as PDF/HTML via the TLX API, not scrapeable from the
// DOM. Instead of scraping, the extension hands the problem URL to the CPHub web
// app, which imports it server-side using the user's stored TLX token.
function requestTLXImport(): { success: boolean; error?: string } {
  const detected = detectPageType();
  if (!detected.isProblem || detected.provider !== "tlx") {
    return { success: false, error: "Not a TLX problem page" };
  }
  chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.OPEN_TLX_IMPORT,
    payload: { url: window.location.href },
  });
  return { success: true };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === MESSAGE_TYPES.SYNC_PROBLEM) {
    sendResponse(requestTLXImport());
  }
  return true;
});

logger.info("TLX content script loaded");

registerOpenEditorHotkey();
