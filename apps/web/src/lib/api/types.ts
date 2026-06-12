export interface Problem {
  id: string;
  provider: string;
  problemId: string;
  title: string;
  statement: string;
  inputSpec: string;
  outputSpec: string;
  note: string;
  difficulty: number;
  timeLimit: string;
  memoryLimit: string;
  tags: string;
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
