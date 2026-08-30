import { apiClient } from "./client";
import type { Problem } from "./types";

export interface ProblemListResponse {
  data: Problem[];
  total: number;
  page: number;
  limit: number;
}

export async function fetchProblems(params?: {
  page?: number;
  limit?: number;
  provider?: string;
  tag?: string;
  difficulty?: number;
  status?: string;
  /** Matches title, problemId and tags server-side. */
  q?: string;
}): Promise<ProblemListResponse> {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set("page", String(params.page));
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.provider) searchParams.set("provider", params.provider);
  if (params?.tag) searchParams.set("tag", params.tag);
  if (params?.difficulty) searchParams.set("difficulty", String(params.difficulty));
  if (params?.status) searchParams.set("status", params.status);
  if (params?.q) searchParams.set("q", params.q);

  const qs = searchParams.toString();
  return apiClient(`/api/problems${qs ? `?${qs}` : ""}`);
}

export async function fetchProblem(id: string): Promise<Problem> {
  return apiClient(`/api/problems/${id}`);
}

export async function searchProblems(q: string): Promise<{ data: Problem[]; total: number }> {
  return apiClient(`/api/problems/search?q=${encodeURIComponent(q)}`);
}

/** One thing the user wrote down about a problem. Absent is not an error — the editor
 *  opens on every problem — so the server answers an empty body instead of a 404. */
export interface ProblemNote {
  body: string;
  updatedAt: string | null;
}

export async function fetchProblemNote(id: string): Promise<ProblemNote> {
  return apiClient(`/api/problems/${encodeURIComponent(id)}/note`);
}

/** Saving an empty body deletes the note rather than storing a blank one. */
export async function saveProblemNote(id: string, body: string): Promise<ProblemNote> {
  return apiClient(`/api/problems/${encodeURIComponent(id)}/note`, {
    method: "PUT",
    body: JSON.stringify({ body }),
  });
}

/** One grader run against this problem, code included — which is the point: the code was
 *  always stored and never readable, so "what changed between the WA and the AC" had no
 *  answer in the app holding both versions. */
export interface ProblemAttempt {
  id: string;
  language: string;
  verdict: string;
  runtime: number;
  memory: number;
  passedTests: number;
  totalTests: number;
  sourceCode: string;
  executedAt: string;
}

export async function fetchProblemAttempts(id: string, limit = 20): Promise<{ data: ProblemAttempt[] }> {
  return apiClient(`/api/problems/${encodeURIComponent(id)}/attempts?limit=${limit}`);
}

/** What the provider links beside a problem — the editorial, mostly. Stored on the problem
 *  row as a JSON array by the statement upload, so this parses rather than fetches. */
export interface ProblemMaterial {
  title: string;
  url: string;
}

export function parseMaterials(raw?: string): ProblemMaterial[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ProblemMaterial[];
    return Array.isArray(parsed) ? parsed.filter((m) => m && m.url) : [];
  } catch {
    return [];
  }
}
