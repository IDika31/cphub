import { apiClient } from "./client";

export interface ImportTLXResult {
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
