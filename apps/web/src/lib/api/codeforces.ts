import { apiClient } from "./client";
import { submitCFViaExtension, registerContestViaExtension, ExtensionMissingError } from "../extension-bridge";

/** Codeforces publishes no OAuth of its own and no write API, so handle+password is
 *  the primary way in: the server keeps a browser session and uses it to submit and
 *  to register. Reads never need this — they go through the official API. */
export async function loginCodeforces(
  handle: string,
  password: string,
  savePassword: boolean,
): Promise<{ handle: string; rating: number; mirror: string; warning?: string }> {
  return apiClient("/api/cf/login", {
    method: "POST",
    body: JSON.stringify({ handle, password, savePassword }),
  });
}

export interface SubmitCFResult {
  submissionId: number;
  verdict: string;
  pending: boolean;
  runtime: number;
  url: string;
}

export async function submitCF(
  problemId: string,
  sourceCode: string,
  language: string,
): Promise<SubmitCFResult> {
  return apiClient("/api/cf/submit", {
    method: "POST",
    body: JSON.stringify({ problemId, sourceCode, language }),
  });
}

/** Finishes a submit the extension made in the browser: the verdict and CPHub's own
 *  history come from the server, because user.status is on the API host and needs
 *  neither a session nor a Cloudflare clearance. */
export async function observeCFSubmit(problemId: string, language: string): Promise<SubmitCFResult> {
  return apiClient("/api/cf/submit/observe", {
    method: "POST",
    body: JSON.stringify({ problemId, language }),
  });
}

/**
 * Submits a Codeforces solution, preferring the user's own browser.
 *
 * The browser is the cheap path: it already holds a logged-in session and a valid
 * Cloudflare clearance, so nothing has to be solved. The server path is the fallback
 * for browsers without the extension, and there the server has to earn its own
 * clearance with a headless Chrome.
 *
 * The fallback fires ONLY when the extension is absent. Any other extension failure is
 * surfaced as-is: once the form has been posted, retrying on the server would either
 * double-submit or collide with Codeforces' own "you have submitted exactly the same
 * code before", and both are worse than an honest error.
 */
export async function submitCFPreferBrowser(
  problem: { id: string; problemId: string },
  sourceCode: string,
  language: string,
): Promise<SubmitCFResult & { via: "browser" | "server" }> {
  const ref = /^(\d+)([A-Za-z]\d*)$/.exec(problem.problemId ?? "");
  if (ref) {
    try {
      await submitCFViaExtension({
        contestId: Number(ref[1]),
        problemIndex: ref[2],
        language,
        source: sourceCode,
      });
      return { ...(await observeCFSubmit(problem.id, language)), via: "browser" };
    } catch (err) {
      if (!(err instanceof ExtensionMissingError)) throw err;
    }
  }
  return { ...(await submitCF(problem.id, sourceCode, language)), via: "server" };
}

/** The dropdown Codeforces itself renders. programTypeId changes whenever a
 *  compiler is updated, so the ids are read live rather than hardcoded. */
export async function fetchCFLanguages(contestId = 1): Promise<{ data: Array<{ id: string; name: string }> }> {
  return apiClient(`/api/cf/languages?contestId=${contestId}`);
}

export interface Contest {
  id: string;
  provider: string;
  contestRef: string;
  name: string;
  type: string;
  phase: string;
  frozen: boolean;
  startTime?: string;
  durationSeconds: number;
  url: string;
  /** When registration opens, when Codeforces said it had not yet. Absent means open, or
   *  unknown — and unknown is treated as open so a wrongly hidden button cannot keep
   *  someone out of a round. Filled by the extension's contest-state sync. */
  registrationOpensAt?: string;
  /** Whether THIS user is signed up. Codeforces exposes registration in no read API —
   *  contest.standings refuses a contest that has not started, which is exactly when
   *  registration is open — so the server reports what it recorded when CPHub registered,
   *  or when Codeforces answered "already registered" to an attempt. A registration made
   *  straight on codeforces.com is unknown until Register is clicked once. */
  registered: boolean;
}

export async function fetchContests(params: {
  upcoming?: boolean;
  phase?: string;
  limit?: number;
} = {}): Promise<{ data: Contest[]; total: number }> {
  const q = new URLSearchParams();
  if (params.upcoming) q.set("upcoming", "true");
  if (params.phase) q.set("phase", params.phase);
  q.set("limit", String(params.limit ?? 50));
  return apiClient(`/api/contests?${q.toString()}`);
}

export async function syncCFContests(): Promise<{ fetched: number; written: number; elapsed: string }> {
  return apiClient("/api/cf/contests/sync", { method: "POST" });
}

export async function syncCFProblemset(): Promise<{ fetched: number; written: number; elapsed: string; note?: string }> {
  return apiClient("/api/cf/problemset/sync", { method: "POST" });
}

export async function syncCFContestProblems(contestRef: string): Promise<{ contest: string; written: number }> {
  return apiClient(`/api/cf/contests/${contestRef}/problems/sync`, { method: "POST" });
}

/** Registration is an action against the contest, taken with the stored session.
 *  `already` distinguishes "you were in this already" from "you are in now". */
export async function registerContest(contestRef: string): Promise<{ registered: boolean; handle: string; already: boolean }> {
  return apiClient(`/api/contests/${contestRef}/register`, { method: "POST" });
}

/** Records a registration the extension performed, so CPHub's own list reflects it. */
export async function recordContestRegistration(contestRef: string): Promise<void> {
  await apiClient(`/api/contests/${contestRef}/registered`, { method: "POST" });
}

/**
 * Registers for a contest, preferring the user's own browser.
 *
 * Same reasoning as submitting: the browser already holds a logged-in session and a valid
 * Cloudflare clearance, while the server has to earn its own — and Codeforces gates some
 * pages hard enough that a headless solve never clears them.
 *
 * The server fallback fires ONLY when the extension is absent. Any other extension failure
 * is surfaced as-is, because a registration that may already have gone through must not be
 * retried down a second path.
 */
export async function registerContestPreferBrowser(
  contestRef: string,
): Promise<{ registered: boolean; already: boolean; via: "browser" | "server" }> {
  const contestId = Number(contestRef);
  if (Number.isFinite(contestId) && contestId > 0) {
    try {
      const res = await registerContestViaExtension(contestId);
      // The server keeps CPHub's own record; the extension only acted on Codeforces.
      await recordContestRegistration(contestRef);
      return { ...res, via: "browser" };
    } catch (err) {
      if (!(err instanceof ExtensionMissingError)) throw err;
    }
  }
  const res = await registerContest(contestRef);
  return { registered: res.registered, already: res.already, via: "server" };
}

/** What CPHub knows about the browser session it holds for Codeforces.
 *
 *  `valid` is a stored verdict, not a live check: every server-side action flags the
 *  account the moment Codeforces refuses it (markSessionExpired), so the sidebar can
 *  ask this on every navigation without anyone touching codeforces.com. Pass
 *  probe = true for the real thing — that costs a request to Codeforces and possibly
 *  a Cloudflare solve, so it belongs behind a button the user pressed. */
export interface CFSessionStatus {
  linked: boolean;
  valid: boolean;
  handle?: string;
  checkedAt?: string;
  reason?: "not_linked" | "no_session" | "expired" | "unreachable" | "probe_failed";
  detail?: string;
}

export async function fetchCFSessionStatus(probe = false): Promise<CFSessionStatus> {
  return apiClient(`/api/cf/session${probe ? "?probe=1" : ""}`);
}

/** Fired after a verification round so the sidebar drops (or re-adds) its entry
 *  without waiting for the next navigation. */
export const CF_SESSION_EVENT = "cphub:cf-session-changed";

export function announceCFSessionChange() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CF_SESSION_EVENT));
}

/** A Codeforces problem that is synced but has no statement yet — the editor can open it
 *  and has nothing to read. The extension fills these in from the user's own browser. */
export interface PendingStatement {
  problemId: string;
  title: string;
  difficulty: number;
}

/** Filters mirror the ones Codeforces' own problemset page offers: tags (ANDed, as it does)
 *  and a rating range. Applied to the rows already synced from the API, which is why this
 *  needs no request to Codeforces at all. */
export async function fetchMissingStatements(params: {
  tags?: string;
  minRating?: number;
  maxRating?: number;
  limit?: number;
}): Promise<{ data: PendingStatement[]; remaining: number }> {
  const q = new URLSearchParams();
  if (params.tags) q.set("tags", params.tags);
  if (params.minRating) q.set("minRating", String(params.minRating));
  if (params.maxRating) q.set("maxRating", String(params.maxRating));
  if (params.limit) q.set("limit", String(params.limit));
  const qs = q.toString();
  return apiClient(`/api/cf/problemset/missing-statements${qs ? `?${qs}` : ""}`);
}
