import { apiClient } from "./client";

export interface RunRequest {
  language: string;
  sourceCode: string;
  testCases: Array<{ input: string; output: string }>;
  timeoutSeconds?: number;
  memoryLimitMB?: number;
}

export interface TestResult {
  index: number;
  verdict: string;
  runtime: number;
  memory: number;
  input: string;
  expected: string;
  output: string;
  error?: string;
}

export interface GraderResult {
  verdict: string;
  totalTests: number;
  passedTests: number;
  maxRuntime: number;
  maxMemory: number;
  results: TestResult[];
  compileError?: string;
}

export async function runCode(payload: RunRequest, token: string): Promise<GraderResult> {
  return apiClient("/api/grader/run", {
    method: "POST",
    body: JSON.stringify(payload),
    token,
  });
}

export async function getGraderStatus(token: string): Promise<{
  component: string;
  queue: { active: number; max: number };
  compilers: Record<string, boolean>;
  firejail: boolean;
}> {
  return apiClient("/api/grader/status", { token });
}
