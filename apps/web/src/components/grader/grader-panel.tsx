"use client";

import { useState } from "react";
import { Play, RefreshCw } from "lucide-react";
import Button from "@/components/ui/button";
import Badge from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { runCode, type GraderResult } from "@/lib/api/grader";
import { subscribeGraderWS } from "@/lib/grader-ws";

interface TestCase {
  input: string;
  output: string;
}

interface Props {
  testCases: TestCase[];
  language: string;
  sourceCode: string;
  token: string;
  onVerdict?: (result: GraderResult) => void;
}

export default function GraderPanel({ testCases, language, sourceCode, token, onVerdict }: Props) {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<GraderResult | null>(null);
  const [activeTab, setActiveTab] = useState<"grader" | "testcases">("grader");
  const { addToast } = useToast();

  async function handleRun() {
    if (!sourceCode.trim()) {
      addToast("error", "No code to run");
      return;
    }
    setIsRunning(true);
    setResult(null);
    try {
      const res = await runCode({ language, sourceCode, testCases }, token);
      setResult(res);
      onVerdict?.(res);
      const msg = res.verdict === "AC" ? "Accepted — all tests passed" : `${res.verdict} — ${res.passedTests}/${res.totalTests}`;
      addToast(res.verdict === "AC" ? "success" : "error", msg);
    } catch (err) {
      addToast("error", `Grader error: ${(err as Error).message}`);
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="h-full flex flex-col bg-[#18181b]">
      {/* Tabs */}
      <div className="flex border-b border-[rgba(255,255,255,0.08)]">
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
            {testCases.length}
          </span>
        </button>
        <div className="flex-1" />
        <button onClick={handleRun} disabled={isRunning} className="px-[14px] h-[34px] flex items-center gap-[5px] text-[12px] font-medium text-[#8b5cf6] hover:text-[#7c3aed] disabled:opacity-45 transition-colors">
          {isRunning ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
          {isRunning ? "Running..." : "Run"}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-[14px]">
        {!result && !isRunning && (
          <div className="text-[12px] text-[#52525b] text-center py-8">
            {testCases.length > 0 ? "Click Run to execute" : "No test cases loaded"}
          </div>
        )}

        {isRunning && (
          <div className="text-[12px] text-[#71717a] text-center py-4 animate-pulse">
            Running tests...
          </div>
        )}

        {result && !isRunning && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-[10px] rounded-[6px] bg-[#1f1f23]">
              <span className="text-[12px] text-[#71717a]">Verdict:</span>
              <Badge variant={
                result.verdict === "AC" ? "verdict-ac" :
                result.verdict === "WA" ? "verdict-wa" :
                result.verdict === "TLE" ? "verdict-tle" :
                result.verdict === "CE" ? "verdict-ce" :
                result.verdict === "RE" ? "verdict-re" : "verdict-pending"
              }>
                {result.verdict}
              </Badge>
              <span className="text-[11px] text-[#52525b] ml-auto">
                {result.passedTests}/{result.totalTests} · {result.maxRuntime}ms
              </span>
            </div>

            {result.compileError && (
              <div className="p-[10px] rounded-[6px] bg-[rgba(239,68,68,0.08)] text-[#ef4444] text-[11px] font-mono whitespace-pre-wrap max-h-[200px] overflow-y-auto">
                {result.compileError}
              </div>
            )}

            {result.results.map((r) => (
              <div key={r.index} className="p-[10px] rounded-[6px] bg-[#1f1f23] border border-[rgba(255,255,255,0.08)]">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[11px] text-[#52525b]">Test #{r.index + 1}</span>
                  <Badge variant={
                    r.verdict === "AC" ? "verdict-ac" :
                    r.verdict === "WA" ? "verdict-wa" :
                    r.verdict === "TLE" ? "verdict-tle" :
                    r.verdict === "CE" ? "verdict-ce" :
                    r.verdict === "RE" ? "verdict-re" : "verdict-pending"
                  }>
                    {r.verdict}
                  </Badge>
                  <span className="text-[11px] text-[#52525b] ml-auto">{r.runtime}ms</span>
                </div>
                {r.verdict === "WA" && (
                  <div className="text-[11px] space-y-1 mt-2">
                    <div>
                      <div className="text-[#ef4444] mb-0.5 text-[10px] uppercase tracking-wide">Expected:</div>
                      <pre className="text-[#e4e4e7] whitespace-pre-wrap bg-[#0f0f10] p-[8px] rounded-[4px] font-mono">{r.expected}</pre>
                    </div>
                    <div>
                      <div className="text-[#10b981] mb-0.5 text-[10px] uppercase tracking-wide">Got:</div>
                      <pre className="text-[#e4e4e7] whitespace-pre-wrap bg-[#0f0f10] p-[8px] rounded-[4px] font-mono">{r.output}</pre>
                    </div>
                  </div>
                )}
                {r.error && (
                  <div className="mt-1 text-[11px] text-[#ef4444] font-mono whitespace-pre-wrap">{r.error}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
