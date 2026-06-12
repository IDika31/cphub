import { MESSAGE_TYPES } from "../shared/messages";
import { detectPageType } from "./detector";
import { logger } from "../shared/logger";

function scrapeProblem(): Record<string, unknown> | null {
  try {
    const titleEl = document.querySelector("h1") || document.querySelector(".problem-title");
    if (!titleEl) return null;
    const title = titleEl.textContent?.trim() || "";

    const urlParts = window.location.pathname.split("/");
    const problemId = urlParts[urlParts.length - 1] || urlParts[urlParts.length - 2] || "";

    return {
      problemId,
      title,
      statement: document.querySelector(".problem-statement, .content, article")?.textContent?.trim() || "",
      inputSpec: "",
      outputSpec: "",
      difficulty: 0,
      timeLimit: document.querySelector(".time-limit")?.textContent?.trim() || "",
      memoryLimit: document.querySelector(".memory-limit")?.textContent?.trim() || "",
      tags: "[]",
      url: window.location.href,
      testCases: [],
    };
  } catch (err) {
    logger.error("Failed to scrape TLX problem", err);
    return null;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === MESSAGE_TYPES.SYNC_PROBLEM) {
    const detected = detectPageType();
    if (!detected.isProblem || detected.provider !== "tlx") {
      sendResponse({ success: false, error: "Not a TLX problem page" });
      return true;
    }
    const data = scrapeProblem();
    if (!data) {
      sendResponse({ success: false, error: "Failed to scrape problem" });
      return true;
    }
    chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.SYNC_PROBLEM,
      payload: {
        provider: "tlx",
        type: "problem",
        url: window.location.href,
        data,
      },
    });
    sendResponse({ success: true, data: { title: data.title } });
  }
  return true;
});

logger.info("TLX content script loaded");

(function autoSync() {
  const detected = detectPageType();
  if (detected.isProblem && detected.provider === "tlx") {
    setTimeout(() => {
      const data = scrapeProblem();
      if (data) {
        chrome.runtime.sendMessage({
          type: MESSAGE_TYPES.SYNC_PROBLEM,
          payload: {
            provider: "tlx",
            type: "problem",
            url: window.location.href,
            data,
          },
        });
        logger.info("Auto-synced TLX problem:", data.title);
      }
    }, 1500);
  }
})();
