import { apiClient } from "./client";

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

/** Registration is an action against the contest, taken with the stored session. */
export async function registerContest(contestRef: string): Promise<{ registered: boolean; handle: string }> {
  return apiClient(`/api/contests/${contestRef}/register`, { method: "POST" });
}
