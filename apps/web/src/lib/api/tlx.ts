import { apiClient } from "./client";

export interface ImportTLXResult {
  id: string;
  problemId: string;
  title: string;
  provider: string;
}

export async function importTLXProblem(url: string): Promise<ImportTLXResult> {
  return apiClient<ImportTLXResult>("/api/problems/import-tlx", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

export interface SubmitTLXResult {
  submissionJid: string;
  verdict: string;
  score: number;
  pending: boolean;
  url: string;
}

export async function submitTLX(
  problemId: string,
  sourceCode: string,
  language: string,
  token: string,
): Promise<SubmitTLXResult> {
  return apiClient<SubmitTLXResult>("/api/problems/submit-tlx", {
    method: "POST",
    body: JSON.stringify({ problemId, sourceCode, language }),
    token,
  });
}
