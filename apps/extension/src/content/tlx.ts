import { MESSAGE_TYPES } from "../shared/messages";
import { detectPageType } from "./detector";
import { logger } from "../shared/logger";

function scrapeProblem(): Record<string, unknown> | null {
  try {
    const titleEl = document.querySelector("h1") || document.querySelector(".problem-title");
    if (!titleEl) return null;

    const title = titleEl.textContent?.trim() || "";
    const statement = document.querySelector(".problem-statement, .content")?.textContent?.trim() || "";

    const timeLimit = document.querySelector(".time-limit")?.textContent?.trim() || "";
    const memoryLimit = document.querySelector(".memory-limit")?.textContent?.trim() || "";

    const tagEls = document.querySelectorAll(".tag, .badge");
    const tags = Array.from(tagEls).map((el) => el.textContent?.trim() || "").filter(Boolean);

    const urlParts = window.location.pathname.split("/");
    const problemId = urlParts[urlParts.length - 1] || urlParts[urlParts.length - 2] || "";

    return {
      provider: "tlx",
      problemId,
      title,
      statement,
      inputSpec: "",
      outputSpec: "",
      difficulty: 0,
      timeLimit,
      memoryLimit,
      tags: JSON.stringify(tags),
      url: window.location.href,
      testCases: [],
    };
  } catch (err) {
    logger.error("Failed to scrape TLX problem", err);
    return null;
  }
}

function detectSession(): { handle: string } | null {
  try {
    const userMenu = document.querySelector(".user-menu, .profile-dropdown, [data-user]");
    if (!userMenu) return null;
    const handle = userMenu.textContent?.trim() || userMenu.getAttribute("data-user") || "";
    return handle ? { handle } : null;
  } catch {
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
      payload: data,
    });
    sendResponse({ success: true, data: { title: data.title } });
  }
  return true;
});

logger.info("TLX content script loaded");
