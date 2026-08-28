/**
 * Reading a Codeforces problem page in the user's own browser.
 *
 * The server can do this too, but it has to clear a Cloudflare managed challenge
 * first, and that costs a headless Chromium — measured at 432 MB peak on a box with
 * 892 MB. This browser is already past the gate, so the page is free here: read the
 * HTML, hand it to CPHub, and let the server's own parser do the rest. One parser,
 * two sources.
 */

import { inCodeforcesTab, type PageResult } from "./cf-tab";
import { pushProblemStatement } from "./api";
import { logger } from "./logger";

/** "4A" or "1234B1" — the ref CPHub stores, and what the page path is built from. */
const PROBLEM_REF = /^(\d+)([A-Za-z]\d*)$/;

export interface CFStatementResult {
  problemId: string;
  title: string;
  samples: number;
}

/**
 * readProblemPage runs inside the problem page and hands back its HTML.
 *
 * It checks for the two pages that are valid HTML but not a statement — the login
 * form and Cloudflare's interstitial — so a failure is reported here, where the
 * message can say which it was, instead of arriving at the server as a statement that
 * parses to nothing.
 */
function readProblemPage(): PageResult<string> {
  if (document.querySelector('input[name="handleOrEmail"]')) {
    return { ok: false, error: "Halaman problem membalas form login — sesi Codeforces di browser ini sudah habis" };
  }
  if (!document.querySelector(".problem-statement")) {
    const title = (document.title || "").trim();
    return { ok: false, error: `Halaman tidak memuat statement (${title || "tanpa judul"})` };
  }
  return { ok: true, data: document.documentElement.outerHTML };
}

/**
 * fetchProblemStatement loads a problem in a background tab and posts the page to
 * CPHub, which parses and stores it.
 *
 * /problemset/problem/<contest>/<index> rather than /contest/<id>/problem/<index>:
 * the problemset path serves the statement without the contest's own access rules,
 * so it works for archived rounds the account never entered.
 */
export async function fetchProblemStatement(problemId: string): Promise<CFStatementResult> {
  const ref = problemId.trim().toUpperCase();
  const m = PROBLEM_REF.exec(ref);
  if (!m) throw new Error(`problemId ${problemId} bukan format Codeforces (mis. 4A)`);

  const path = `/problemset/problem/${m[1]}/${m[2]}`;
  const html = await inCodeforcesTab(path, readProblemPage, null);
  const saved = await pushProblemStatement(ref, `https://codeforces.com${path}`, html);
  logger.info(`Codeforces statement for ${ref}: ${saved.samples} sample(s) stored`);
  return saved;
}
