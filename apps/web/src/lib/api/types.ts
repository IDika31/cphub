export interface Problem {
  id: string;
  provider: string;
  problemId: string;
  title: string;
  statement: string;
  inputSpec: string;
  outputSpec: string;
  note: string;
  problemGroup: string;
  difficulty: number;
  timeLimit: string;
  memoryLimit: string;
  tags: string;
  /** JSON array of {title, url} — what the provider links beside the problem, the
   *  editorial above all. Filled by the statement upload, so it is empty until a
   *  statement has been read for this problem. */
  materials?: string;
  url: string;
  status: string;
  syncedAt: string;
  createdAt: string;
  testCases: TestCase[];
}

export interface TestCase {
  id: string;
  problemId: string;
  input: string;
  output: string;
  isSample: boolean;
  isCustom: boolean;
  order: number;
}
