import { apiClient } from "./client";

export interface ExternalSubmission {
  id: string;
  provider: string;
  submissionId: string;
  problemTitle: string;
  problemRef: string;
  language: string;
  verdict: string;
  runtime: number;
  memory: number;
  submittedAt?: string;
}

export interface LocalSubmission {
  id: string;
  problemId: string;
  language: string;
  verdict: string;
  runtime: number;
  memory: number;
  passedTests: number;
  totalTests: number;
  executedAt: string;
}

export async function fetchExternalSubmissions(params?: {
  provider?: string;
  page?: number;
  limit?: number;
}): Promise<{ data: ExternalSubmission[]; total: number; page: number; limit: number }> {
  const searchParams = new URLSearchParams();
  if (params?.provider) searchParams.set("provider", params.provider);
  if (params?.page) searchParams.set("page", String(params.page));
  if (params?.limit) searchParams.set("limit", String(params.limit));

  const qs = searchParams.toString();
  return apiClient(`/api/submissions/external${qs ? `?${qs}` : ""}`);
}

export async function fetchLocalSubmissions(params?: {
  page?: number;
  limit?: number;
}): Promise<{ data: LocalSubmission[]; total: number; page: number; limit: number }> {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set("page", String(params.page));
  if (params?.limit) searchParams.set("limit", String(params.limit));

  const qs = searchParams.toString();
  return apiClient(`/api/submissions/local${qs ? `?${qs}` : ""}`);
}
