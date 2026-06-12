"use client";

import { useState } from "react";
import { VerdictBadge } from "@/components/ui/badge";

interface TestResult {
  index: number;
  verdict: string;
  runtime: number;
  input: string;
  expected: string;
  output: string;
  error?: string;
}

interface GraderResult {
  verdict: string;
  totalTests: number;
  passedTests: number;
  maxRuntime: number;
  compileError?: string;
  results: TestResult[];
}

export default function GraderPanel() {
  const [activeTab, setActiveTab] = useState<"grader" | "testcases">("grader");
  const [result, setResult] = useState<GraderResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  return (
    <div className="h-full flex flex-col">
      {/* Tabs */}
      <div className="flex border-b border-[rgba(255,255,255,0.08)] bg-[#18181b]">
        <button
          onClick={() => setActiveTab("grader")}
          className={`px-[14px] text-[12px] font-medium flex items-center gap-[5px] h-[34px] transition-colors ${
            activeTab === "grader"
              ? "text-[#8b5cf6] border-b-2 border-[#8b5cf6]"
              : "text-[#71717a] hover:text-[#e4e4e7] border-b-2 border-transparent"
          }`}
        >
          Grader
        </button>
        <button
          onClick={() => setActiveTab("testcases")}
          className={`px-[14px] text-[12px] font-medium flex items-center gap-[5px] h-[34px] transition-colors ${
            activeTab === "testcases"
              ? "text-[#8b5cf6] border-b-2 border-[#8b5cf6]"
              : "text-[#71717a] hover:text-[#e4e4e7] border-b-2 border-transparent"
          }`}
        >
          Test Cases
          <span className="min-w-[16px] h-4 px-1 rounded-full text-[10px] font-semibold bg-[rgba(139,92,246,0.15)] text-[#8b5cf6] inline-flex items-center justify-center">
            {result?.totalTests || 0}
          </span>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-[14px]">
        {activeTab === "grader" && (
          <div className="space-y-3">
            {isRunning && (
              <div className="text-[12px] text-[#71717a] animate-pulse">
                Running tests...
              </div>
            )}

            {result && !isRunning && (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-[#71717a]">Verdict:</span>
                  <VerdictBadge verdict={result.verdict} />
                  <span className="text-[12px] text-[#71717a] ml-auto">
                    {result.passedTests}/{result.totalTests} passed · {result.maxRuntime}ms
                  </span>
                </div>

                {result.compileError && (
                  <div className="p-[10px] rounded-[6px] bg-[rgba(239,68,68,0.08)] text-[#ef4444] text-[11px] font-mono whitespace-pre-wrap">
                    {result.compileError}
                  </div>
                )}

                {result.results.map((r) => (
                  <div
                    key={r.index}
                    className="p-[10px] rounded-[6px] bg-[#1f1f23] border border-[rgba(255,255,255,0.08)]"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[11px] text-[#52525b]">
                        Test #{r.index + 1}
                      </span>
                      <VerdictBadge verdict={r.verdict} />
                      <span className="text-[11px] text-[#52525b] ml-auto">
                        {r.runtime}ms
                      </span>
                    </div>
                    {r.verdict === "WA" && (
                      <div className="text-[11px] space-y-1 mt-2">
                        <div>
                          <div className="text-[#ef4444] mb-0.5">Expected:</div>
                          <pre className="text-[#71717a] whitespace-pre-wrap">
                            {r.expected}
                          </pre>
                        </div>
                        <div>
                          <div className="text-[#10b981] mb-0.5">Got:</div>
                          <pre className="text-[#71717a] whitespace-pre-wrap">
                            {r.output}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}

            {!result && !isRunning && (
              <div className="text-[12px] text-[#52525b] text-center py-8">
                Run your code to see results here
              </div>
            )}
          </div>
        )}

        {activeTab === "testcases" && (
          <div className="text-[12px] text-[#52525b] text-center py-8">
            No test cases loaded. Sync a problem first.
          </div>
        )}
      </div>
    </div>
  );
}
