import { MESSAGE_TYPES } from "../shared/messages";
import { detectPageType } from "./detector";
import { logger } from "../shared/logger";

function scrapeProblem(): Record<string, unknown> | null {
  try {
    const container = document.querySelector(".problemindexholder");
    if (!container) return null;

    // Title
    const titleEl = container.querySelector(".problem-statement .header .title");
    const title = titleEl?.textContent?.trim() || "";

    // Time limit
    const timeEl = container.querySelector(".time-limit");
    const timeLimit = timeEl?.lastChild?.textContent?.trim() || timeEl?.textContent?.replace("time limit per test", "").trim() || "";

    // Memory limit
    const memEl = container.querySelector(".memory-limit");
    const memoryLimit = memEl?.lastChild?.textContent?.trim() || memEl?.textContent?.replace("memory limit per test", "").trim() || "";

    // Statement — capture full HTML with MathJax
    const statementEl = container.querySelector(".problem-statement > div:not(.header):not(.input-specification):not(.output-specification):not(.sample-tests):not(.note)");
    const statementHTML = statementEl?.innerHTML || "";

    // Input specification
    const inputSpecEl = container.querySelector(".input-specification");
    const inputSpecHTML = inputSpecEl?.innerHTML || "";

    // Output specification
    const outputSpecEl = container.querySelector(".output-specification");
    const outputSpecHTML = outputSpecEl?.innerHTML || "";

    // Note
    const noteEl = container.querySelector(".note");
    const noteHTML = noteEl?.innerHTML || "";

    // Tags from sidebar
    const tagEls = document.querySelectorAll(".tag-box");
    const tags = Array.from(tagEls).map((el) => el.textContent?.trim() || "").filter(Boolean);

    // Difficulty from problem index page or contest page
    // Try to get from the problem rating span
    const ratingEl = document.querySelector("span.difficulty-color, span.problem-rating");
    const difficultyText = ratingEl?.textContent?.trim() || "";
    const difficulty = parseInt(difficultyText.replace(/\D/g, "")) || 0;

    // Extract LaTeX from MathJax spans
    const mathSpans = container.querySelectorAll("script[type='math/tex'], script[type='math/tex; mode=display']");
    const latexExpressions: Record<string, string> = {};
    mathSpans.forEach((span, i) => {
      const key = `__LATEX_${i}__`;
      const tex = span.textContent || "";
      latexExpressions[key] = tex;
    });

    // Sample test cases — preserve exact text with newlines
    const sampleTestDiv = container.querySelector(".sample-tests");
    const testCases: Array<{ input: string; output: string; isSample: boolean }> = [];
    if (sampleTestDiv) {
      const inputPre = sampleTestDiv.querySelector(".input pre");
      const outputPre = sampleTestDiv.querySelector(".output pre");

      if (inputPre && outputPre) {
        // Get raw text — preserve newlines from <div> elements
        const inputText = getRawText(inputPre);
        const outputText = getRawText(outputPre);
        testCases.push({ input: inputText, output: outputText, isSample: true });
      }

      // Individual test example lines
      const testLines = sampleTestDiv.querySelectorAll(".test-example-line");
      if (testLines.length > 0) {
        const lines = Array.from(testLines).map((el) => el.textContent?.trim() || "");
        // Group lines into test cases based on the problem
        // For now, create one test case with all lines
        if (testCases.length === 0) {
          testCases.push({
            input: lines.join("\n"),
            output: lines.join("\n"),
            isSample: true,
          });
        }
      }
    }

    // Problem ID from URL
    const urlPath = window.location.pathname;
    let problemId = "";
    let contestId = "";
    let problemGroup = "";

    const contestMatch = urlPath.match(/\/contest\/(\d+)\/problem\/(\w+)/);
    const problemsetMatch = urlPath.match(/\/problemset\/problem\/(\d+)\/(\w+)/);
    if (contestMatch) {
      contestId = contestMatch[1];
      problemId = `${contestId}${contestMatch[2]}`;
      problemGroup = document.querySelector(".caption.titled a, .rtable th a")?.textContent?.trim() || "";
    } else if (problemsetMatch) {
      contestId = problemsetMatch[1];
      problemId = `${contestId}${problemsetMatch[2]}`;
      problemGroup = document.querySelector(".caption.titled a, .rtable th a")?.textContent?.trim() || "";
    }

    return {
      provider: "codeforces",
      problemId,
      contestId,
      problemGroup,
      title,
      statement: statementHTML,
      inputSpec: inputSpecHTML,
      outputSpec: outputSpecHTML,
      note: noteHTML,
      latex: latexExpressions,
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

// Get raw text preserving newlines from <br> and <div> elements
function getRawText(el: Element): string {
  let result = "";
  function walk(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent || "";
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = (node as Element).tagName.toLowerCase();
      if (tag === "br") {
        result += "\n";
      } else if (tag === "div") {
        if (result && !result.endsWith("\n")) result += "\n";
        node.childNodes.forEach(walk);
        if (!result.endsWith("\n")) result += "\n";
      } else {
        node.childNodes.forEach(walk);
      }
    }
  }
  el.childNodes.forEach(walk);
  return result.trim();
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
    chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.SYNC_PROBLEM,
      payload: { ...data, type: "problem" },
    });
    sendResponse({ success: true, data: { title: data.title } });
  }
  return true;
});

logger.info("Codeforces content script loaded");

// Auto-sync on page load — if on a problem page, sync automatically
// Dedup: track last synced URL to avoid duplicate syncs
let lastSyncedUrl = "";

(function autoSync() {
  const detected = detectPageType();
  if (detected.isProblem && detected.provider === "codeforces") {
    // Skip if already synced this URL
    if (lastSyncedUrl === window.location.href) return;
    lastSyncedUrl = window.location.href;

    // Small delay to ensure page is fully loaded
    setTimeout(() => {
      const data = scrapeProblem();
      if (data) {
        chrome.runtime.sendMessage({
          type: MESSAGE_TYPES.SYNC_PROBLEM,
          payload: { ...data, type: "problem" },
        });
        logger.info("Auto-synced problem:", (data as any).title);
      }
    }, 1500);
  }
})();
