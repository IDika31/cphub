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
}): Promise<ProblemListResponse> {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set("page", String(params.page));
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.provider) searchParams.set("provider", params.provider);
  if (params?.tag) searchParams.set("tag", params.tag);
  if (params?.difficulty) searchParams.set("difficulty", String(params.difficulty));
  if (params?.status) searchParams.set("status", params.status);

  const qs = searchParams.toString();
  return apiClient(`/api/problems${qs ? `?${qs}` : ""}`);
}

export async function fetchProblem(id: string): Promise<Problem> {
  return apiClient(`/api/problems/${id}`);
}

export async function searchProblems(q: string): Promise<{ data: Problem[]; total: number }> {
  return apiClient(`/api/problems/search?q=${encodeURIComponent(q)}`);
}
