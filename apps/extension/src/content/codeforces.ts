import { MESSAGE_TYPES } from "../shared/messages";
import { detectPageType } from "./detector";
import { logger } from "../shared/logger";

function scrapeProblem(): Record<string, unknown> | null {
  try {
    const titleEl = document.querySelector(".problem-statement .header .title");
    if (!titleEl) return null;
    const title = titleEl.textContent?.trim() || "";
    const timeEl = document.querySelector(".time-limit");
    const memEl = document.querySelector(".memory-limit");
    const tagEls = document.querySelectorAll(".tag-box");
    const tags = Array.from(tagEls).map((el) => el.textContent?.trim() || "").filter(Boolean);

    const sampleInputs = document.querySelectorAll(".input pre");
    const sampleOutputs = document.querySelectorAll(".output pre");
    const testCases: Array<{ input: string; output: string; isSample: boolean }> = [];
    for (let i = 0; i < Math.min(sampleInputs.length, sampleOutputs.length); i++) {
      testCases.push({
        input: sampleInputs[i].textContent?.trim() || "",
        output: sampleOutputs[i].textContent?.trim() || "",
        isSample: true,
      });
    }

    const urlParts = window.location.pathname.split("/");
    const problemId = urlParts[urlParts.length - 1] || "";

    return {
      problemId,
      title,
      statement: document.querySelector(".problem-statement")?.textContent?.trim() || "",
      inputSpec: document.querySelector(".input-specification")?.textContent?.trim() || "",
      outputSpec: document.querySelector(".output-specification")?.textContent?.trim() || "",
      difficulty: 0,
      timeLimit: timeEl?.textContent?.replace("time limit per test", "").trim() || "",
      memoryLimit: memEl?.textContent?.replace("memory limit per test", "").trim() || "",
      tags: JSON.stringify(tags),
      url: window.location.href,
      testCases,
    };
  } catch (err) {
    logger.error("Failed to scrape CF problem", err);
    return null;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === MESSAGE_TYPES.SYNC_PROBLEM) {
    const detected = detectPageType();
    if (!detected.isProblem || detected.provider !== "codeforces") {
      sendResponse({ success: false, error: "Not a Codeforces problem page" });
      return true;
    }
    const data = scrapeProblem();
    if (!data) {
      sendResponse({ success: false, error: "Failed to scrape problem" });
      return true;
    }
    // Wrap in SyncPayload format expected by background
    chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.SYNC_PROBLEM,
      payload: {
        provider: "codeforces",
        type: "problem",
        url: window.location.href,
        data,
      },
    });
    sendResponse({ success: true, data: { title: data.title } });
  }
  return true;
});

logger.info("Codeforces content script loaded");
