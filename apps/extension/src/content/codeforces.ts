import { MESSAGE_TYPES } from "../shared/messages";
import { detectPageType, observeNavigation } from "./detector";
import { logger } from "../shared/logger";

// Scrape Codeforces problem page
function scrapeProblem(): Record<string, unknown> | null {
  try {
    const titleEl = document.querySelector(".problem-statement .header .title");
    if (!titleEl) return null;

    const title = titleEl.textContent?.trim() || "";
    const statement = document.querySelector(".problem-statement")?.textContent?.trim() || "";

    // Time & memory limit
    const timeLimitEl = document.querySelector(".time-limit");
    const memLimitEl = document.querySelector(".memory-limit");
    const timeLimit = timeLimitEl?.textContent?.replace("time limit per test", "").trim() || "";
    const memoryLimit = memLimitEl?.textContent?.replace("memory limit per test", "").trim() || "";

    // Tags
    const tagEls = document.querySelectorAll(".tag-box");
    const tags = Array.from(tagEls).map((el) => el.textContent?.trim() || "").filter(Boolean);

    // Input/Output specs
    const inputSpec = document.querySelector(".input-specification")?.textContent?.trim() || "";
    const outputSpec = document.querySelector(".output-specification")?.textContent?.trim() || "";

    // Sample test cases
    const sampleInputs = document.querySelectorAll(".input pre");
    const sampleOutputs = document.querySelectorAll(".output pre");
    const testCases = [];
    for (let i = 0; i < Math.min(sampleInputs.length, sampleOutputs.length); i++) {
      testCases.push({
        input: sampleInputs[i].textContent?.trim() || "",
        output: sampleOutputs[i].textContent?.trim() || "",
        isSample: true,
      });
    }

    // Problem ID from URL
    const urlParts = window.location.pathname.split("/");
    const problemId = urlParts[urlParts.length - 1] || "";

    // Difficulty from problem index (rough estimate)
    const difficulty = 800; // CF default

    return {
      provider: "codeforces",
      problemId,
      title,
      statement,
      inputSpec,
      outputSpec,
      difficulty,
      timeLimit,
      memoryLimit,
      tags: JSON.stringify(tags),
      url: window.location.href,
      testCases,
    };
  } catch (err) {
    logger.error("Failed to scrape CF problem", err);
    return null;
  }
}

// Scrape Codeforces submission page
function scrapeSubmission(): Record<string, unknown> | null {
  try {
    const rows = document.querySelectorAll("table.status-frame-datatable tr");
    const submissions = [];
    for (let i = 1; i < rows.length; i++) {
      const cells = rows[i].querySelectorAll("td");
      if (cells.length < 6) continue;
      submissions.push({
        submissionId: cells[0].textContent?.trim() || "",
        problemTitle: cells[3].textContent?.trim() || "",
        problemRef: "",
        language: cells[4].textContent?.trim() || "",
        verdict: cells[5].textContent?.trim() || "",
        runtime: parseInt(cells[6].textContent?.replace("ms", "") || "0"),
        memory: parseInt(cells[7].textContent?.replace("KB", "") || "0"),
      });
    }
    return { provider: "codeforces", type: "submission", submissions };
  } catch (err) {
    logger.error("Failed to scrape CF submissions", err);
    return null;
  }
}

// Listen for sync requests from popup/background
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
    chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.SYNC_PROBLEM,
      payload: data,
    });
    sendResponse({ success: true, data: { title: data.title } });
  }
  return true;
});

logger.info("Codeforces content script loaded");
