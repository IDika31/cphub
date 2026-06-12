"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { Play, RotateCcw, FileCode } from "lucide-react";
import Topbar from "@/components/shell/topbar";
import Badge, { VerdictBadge } from "@/components/ui/badge";
import Button from "@/components/ui/button";
import Select from "@/components/ui/select";
import Skeleton from "@/components/ui/skeleton";
import MonacoEditor from "@/components/editor/monaco-editor";
import ProblemStatement from "@/components/editor/problem-statement";
import { fetchProblem } from "@/lib/api/problems";
import { runCode, type GraderResult } from "@/lib/api/grader";
import { getDefaultTemplate } from "@/lib/template";
import { saveToLocalStorage, loadFromLocalStorage, debounce } from "@/lib/auto-save";
import type { Problem } from "@/lib/api/types";

const LANGUAGES = [
  { value: "cpp17", label: "C++17" },
  { value: "cpp20", label: "C++20" },
  { value: "python3", label: "Python 3" },
  { value: "java21", label: "Java 21" },
  { value: "nodejs", label: "JavaScript" },
];

function getToken() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("cphub_token") || "";
}

export default function ProblemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [problem, setProblem] = useState<Problem | null>(null);
  const [loading, setLoading] = useState(true);
  const [language, setLanguage] = useState("cpp17");
  const [code, setCode] = useState("");
  const [result, setResult] = useState<GraderResult | null>(null);
  const [running, setRunning] = useState(false);
  const [tab, setTab] = useState<"grader" | "testcases">("grader");

  // Load problem
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetchProblem(id)
      .then((p) => {
        setProblem(p);
        // Load saved code or use template
        const saved = loadFromLocalStorage(id, language);
        setCode(saved || getDefaultTemplate(language));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  // Auto-save on code change (300ms debounce)
  const saveCode = useCallback(
    debounce((code: string, lang: string) => {
      if (id) saveToLocalStorage(id, lang, code);
    }, 300),
    [id],
  );

  function handleCodeChange(value: string) {
    setCode(value);
    saveCode(value, language);
  }

  // Change language → load saved or template
  function handleLanguageChange(lang: string) {
    setLanguage(lang);
    const saved = loadFromLocalStorage(id, lang);
    setCode(saved || getDefaultTemplate(lang));
  }

  // Run grader
  async function handleRun() {
    if (!code.trim()) return;
    setRunning(true);
    setResult(null);
    setTab("grader");
    try {
      const testCases = (problem?.testCases || []).map((tc) => ({
        input: tc.input,
        output: tc.output,
      }));
      if (testCases.length === 0) {
        // If no test cases, run with empty
        testCases.push({ input: "", output: "" });
      }
      const res = await runCode(
        { language, sourceCode: code, testCases },
        getToken(),
      );
      setResult(res);
    } catch {}
    setRunning(false);
  }

  function handleTemplate() {
    setCode(getDefaultTemplate(language));
  }

  function handleReset() {
    const saved = loadFromLocalStorage(id, language);
    setCode(saved || getDefaultTemplate(language));
    setResult(null);
  }

  const tags = (() => { try { return JSON.parse(problem?.tags || "[]") as string[] } catch { return [] } })();

  return (
    <>
      <Topbar title={problem?.title || `Problem ${id}`}>
        {problem && (
          <>
            <Badge variant={problem.provider === "codeforces" ? "cf" : "difficulty"}>
              {problem.provider}
            </Badge>
            {problem.timeLimit && (
              <Badge variant="time">{problem.timeLimit} / {problem.memoryLimit}</Badge>
            )}
            <div className="flex-1" />
            <Select
              options={LANGUAGES}
              value={language}
              onChange={(e) => handleLanguageChange(e.target.value)}
            />
            <Button variant="ghost" onClick={handleTemplate}>
              <FileCode className="w-3 h-3" /> Template
            </Button>
            <Button variant="ghost" onClick={handleReset}>
              <RotateCcw className="w-3 h-3" /> Reset
            </Button>
            <Button variant="primary" onClick={handleRun} disabled={running}>
              <Play className="w-3 h-3" /> {running ? "Running..." : "Run"}
            </Button>
          </>
        )}
      </Topbar>

      <div className="flex-1 flex min-h-0">
        {/* Left: Statement */}
        <div className="w-[42%] overflow-y-auto p-[14px] border-r border-[rgba(255,255,255,0.08)]">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ) : problem ? (
            <div className="bg-[#18181b] rounded-[8px] border border-[rgba(255,255,255,0.08)] p-[16px]">
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {tags.map((t: string) => (
                    <span key={t} className="px-[6px] py-[1px] rounded-full text-[10px] bg-[#1f1f23] text-[#71717a] border border-[rgba(255,255,255,0.08)]">
                      {t}
                    </span>
                  ))}
                </div>
              )}
              <ProblemStatement
                html={problem.statement || ""}
                title={problem.title}
              />
              {problem.url && (
                <a href={problem.url} target="_blank" rel="noopener noreferrer" className="inline-block mt-3 text-[11px] text-[#8b5cf6] hover:underline">
                  View on {problem.provider} →
                </a>
              )}
            </div>
          ) : (
            <div className="text-[13px] text-[#52525b] text-center py-8">
              Problem not found
            </div>
          )}
        </div>

        {/* Resize Handle */}
        <div className="w-[5px] flex-shrink-0 cursor-col-resize bg-[rgba(255,255,255,0.08)] hover:bg-[#8b5cf6] transition-colors" />

        {/* Right: Editor + Grader */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Editor */}
          <div className="flex-[3] min-h-0">
            <MonacoEditor
              value={code}
              language={language}
              onChange={handleCodeChange}
              onRun={handleRun}
            />
          </div>

          {/* Row Resize */}
          <div className="h-[5px] flex-shrink-0 cursor-row-resize bg-[rgba(255,255,255,0.08)] hover:bg-[#8b5cf6] transition-colors" />

          {/* Grader Panel */}
          <div className="flex-[2] min-h-0 bg-[#18181b] flex flex-col">
            <div className="flex border-b border-[rgba(255,255,255,0.08)]">
              <button
                onClick={() => setTab("grader")}
                className={`px-[14px] text-[12px] font-medium flex items-center gap-[5px] h-[34px] transition-colors ${
                  tab === "grader" ? "text-[#8b5cf6] border-b-2 border-[#8b5cf6]" : "text-[#71717a] hover:text-[#e4e4e7] border-b-2 border-transparent"
                }`}
              >
                Grader
              </button>
              <button
                onClick={() => setTab("testcases")}
                className={`px-[14px] text-[12px] font-medium flex items-center gap-[5px] h-[34px] transition-colors ${
                  tab === "testcases" ? "text-[#8b5cf6] border-b-2 border-[#8b5cf6]" : "text-[#71717a] hover:text-[#e4e4e7] border-b-2 border-transparent"
                }`}
              >
                Test Cases
                <span className="min-w-[16px] h-4 px-1 rounded-full text-[10px] font-semibold bg-[rgba(139,92,246,0.15)] text-[#8b5cf6] inline-flex items-center justify-center">
                  {problem?.testCases?.length || 0}
                </span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-[14px]">
              {tab === "grader" && (
                <div className="space-y-3 text-[12px]">
                  {running && (
                    <div className="text-subtle animate-pulse">Compiling & running tests...</div>
                  )}

                  {result && !running && (
                    <>
                      <div className="flex items-center gap-2 p-[10px] rounded-[6px] bg-[#1f1f23]">
                        <span className="text-subtle">Verdict:</span>
                        <VerdictBadge verdict={result.verdict} />
                        <span className="text-muted ml-auto">
                          {result.passedTests}/{result.totalTests} passed · {result.maxRuntime}ms
                        </span>
                      </div>

                      {result.compileError && (
                        <div className="p-[10px] rounded-[6px] bg-[rgba(239,68,68,0.08)] text-red-500 text-[11px] font-mono whitespace-pre-wrap max-h-[200px] overflow-y-auto">
                          {result.compileError}
                        </div>
                      )}

                      {result.results.map((r, i) => (
                        <div key={i} className="p-[10px] rounded-[6px] bg-[#1f1f23] border border-[rgba(255,255,255,0.08)]">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[11px] text-muted">Test #{i + 1}</span>
                            <VerdictBadge verdict={r.verdict} />
                            <span className="text-[11px] text-muted ml-auto">{r.runtime}ms</span>
                          </div>
                          {r.verdict === "WA" && (
                            <div className="grid grid-cols-2 gap-2 mt-2 text-[11px]">
                              <div>
                                <div className="text-red-500 mb-0.5 text-[10px] uppercase">Expected</div>
                                <pre className="text-[#e4e4e7] whitespace-pre-wrap bg-[#0f0f10] p-[6px] rounded-[4px] font-mono max-h-[80px] overflow-y-auto">{r.expected}</pre>
                              </div>
                              <div>
                                <div className="text-green-500 mb-0.5 text-[10px] uppercase">Got</div>
                                <pre className="text-[#e4e4e7] whitespace-pre-wrap bg-[#0f0f10] p-[6px] rounded-[4px] font-mono max-h-[80px] overflow-y-auto">{r.output}</pre>
                              </div>
                            </div>
                          )}
                          {r.error && (
                            <div className="mt-1 text-[11px] text-red-500 font-mono whitespace-pre-wrap">{r.error}</div>
                          )}
                        </div>
                      ))}
                    </>
                  )}

                  {!result && !running && (
                    <div className="text-muted text-center py-8">
                      <Play className="w-5 h-5 mx-auto mb-2 opacity-30" />
                      Click <span className="text-white font-medium">Run</span> or press{" "}
                      <kbd className="px-[4px] py-[1px] text-[10px] bg-[#1f1f23] border border-white/10 rounded-[3px]">Ctrl+Enter</kbd>
                    </div>
                  )}
                </div>
              )}

              {tab === "testcases" && (
                <div className="space-y-2">
                  {problem?.testCases?.length === 0 ? (
                    <div className="text-muted text-center py-8">No test cases available for this problem</div>
                  ) : (
                    problem?.testCases?.map((tc, i) => (
                      <details key={tc.id || i} className="group">
                        <summary className="text-[12px] text-subtle cursor-pointer hover:text-white transition-colors py-1 select-none">
                          Test #{i + 1} {tc.isSample && <span className="text-[10px] text-accent ml-1">(sample)</span>}
                        </summary>
                        <div className="grid grid-cols-2 gap-2 mt-1 mb-2">
                          <div>
                            <div className="text-[10px] text-muted mb-0.5 uppercase">Input</div>
                            <pre className="text-[12px] font-mono bg-[#0f0f10] p-[8px] rounded-[4px] text-[#e4e4e7] whitespace-pre-wrap max-h-[100px] overflow-y-auto">{tc.input}</pre>
                          </div>
                          <div>
                            <div className="text-[10px] text-muted mb-0.5 uppercase">Expected Output</div>
                            <pre className="text-[12px] font-mono bg-[#0f0f10] p-[8px] rounded-[4px] text-[#e4e4e7] whitespace-pre-wrap max-h-[100px] overflow-y-auto">{tc.output}</pre>
                          </div>
                        </div>
                      </details>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
