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
import { getDefaultTemplate, applyTemplate } from "@/lib/template";
import { saveToLocalStorage, loadFromLocalStorage, debounce } from "@/lib/auto-save";
import { apiClient } from "@/lib/api/client";
import type { Problem } from "@/lib/api/types";

const LANGUAGES = [
  { value: "cpp20", label: "C++20" },
  { value: "cpp17", label: "C++17" },
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
  const [language, setLanguage] = useState("cpp20");
  const [code, setCode] = useState("");
  const [result, setResult] = useState<GraderResult | null>(null);
  const [running, setRunning] = useState(false);
  const [tab, setTab] = useState<"grader" | "testcases">("grader");

  // Load problem
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(id);
    const token = getToken();
    const promise = isUuid
      ? fetchProblem(id)
      : apiClient('/api/problems/by-provider/codeforces/' + id, { token });
    promise
      .then((p) => {
        setProblem(p);
        const saved = loadFromLocalStorage(id, language);
        if (saved) {
          setCode(saved);
        } else {
          const tpl = getDefaultTemplate(language);
          const vars: Record<string, string> = {
            provider: p.provider || "cf",
            problemId: p.problemId || id,
            title: p.title || "",
            problemGroup: (p as Record<string,string>).problemGroup || "",
          };
          setCode(applyTemplate(tpl, vars));
        }
      })
      .catch(() => {
        // On error, at least load the template
        setCode(getDefaultTemplate(language));
      })
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
      const timeout = parseInt(problem?.timeLimit || "5") || 5;
      const memLimit = parseInt(problem?.memoryLimit || "512") || 512;
      const res = await runCode(
        { language, sourceCode: code, testCases, timeoutSeconds: timeout, memoryLimitMB: memLimit },
        getToken(),
      );
      setResult(res);
    } catch {}
    setRunning(false);
  }

  function handleTemplate() {
    const tpl = getDefaultTemplate(language);
    const vars = {
      provider: problem?.provider || "cf",
      problemId: problem?.problemId || id,
      title: problem?.title || "",
      problemGroup: (problem as Record<string,string>|null)?.problemGroup || "",
    };
    const newCode = applyTemplate(tpl, vars);
    setCode(newCode);
    if (id) saveToLocalStorage(id, language, newCode);
  }

  function handleReset() {
    const saved = loadFromLocalStorage(id, language);
    if (saved) {
      setCode(saved);
    } else {
      const tpl = getDefaultTemplate(language);
      const vars = { provider: problem?.provider || "cf", problemId: problem?.problemId || id, title: problem?.title || "" };
      setCode(applyTemplate(tpl, vars));
    }
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
              <ProblemStatement html={problem.statement || ""} />
              {problem.inputSpec && (
                <ProblemStatement html={problem.inputSpec} />
              )}
              {problem.outputSpec && (
                <ProblemStatement html={problem.outputSpec} />
              )}
              {problem.note && (
                <ProblemStatement html={problem.note} />
              )}
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

        {/* Resize Handle — horizontal */}
        <div
          className="w-[5px] flex-shrink-0 cursor-col-resize bg-[rgba(255,255,255,0.08)] hover:bg-[#8b5cf6] transition-colors"
          onMouseDown={(e) => {
            e.preventDefault();
            const leftPane = e.currentTarget.previousElementSibling as HTMLElement;
            const rightPane = e.currentTarget.nextElementSibling as HTMLElement;
            const startX = e.clientX;
            const startLeftWidth = leftPane.offsetWidth;
            const startRightWidth = rightPane ? rightPane.offsetWidth : 0;
            const totalWidth = startLeftWidth + startRightWidth + 5;
            function onMove(ev: MouseEvent) {
              const dx = ev.clientX - startX;
              const newLeft = Math.max(200, Math.min(totalWidth - 300, startLeftWidth + dx));
              leftPane.style.width = newLeft + "px";
              leftPane.style.flex = "none";
              if (rightPane) {
                rightPane.style.flex = "1 1 0%";
              }
            }
            function onUp() {
              document.removeEventListener("mousemove", onMove);
              document.removeEventListener("mouseup", onUp);
            }
            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", onUp);
          }}
        />

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
          <div
            className="h-[5px] flex-shrink-0 cursor-row-resize bg-[rgba(255,255,255,0.08)] hover:bg-[#8b5cf6] transition-colors"
            onMouseDown={(e) => {
              e.preventDefault();
              const parent = e.currentTarget.parentElement as HTMLElement;
              const topPane = e.currentTarget.previousElementSibling as HTMLElement;
              const bottomPane = e.currentTarget.nextElementSibling as HTMLElement;
              const startY = e.clientY;
              const startTopHeight = topPane.offsetHeight;
              const startBottomHeight = bottomPane ? bottomPane.offsetHeight : 0;
              const totalHeight = startTopHeight + startBottomHeight + 5;
              function onMove(ev: MouseEvent) {
                const dy = ev.clientY - startY;
                const newTop = Math.max(100, Math.min(totalHeight - 100, startTopHeight + dy));
                topPane.style.height = newTop + "px";
                topPane.style.flex = "none";
                if (bottomPane) {
                  bottomPane.style.flex = "1 1 0%";
                }
              }
              function onUp() {
                document.removeEventListener("mousemove", onMove);
                document.removeEventListener("mouseup", onUp);
              }
              document.addEventListener("mousemove", onMove);
              document.addEventListener("mouseup", onUp);
            }}
          />

          {/* Bottom Panel */}
          <div className="flex-[2] min-h-0 bg-[#18181b] flex flex-col border-t border-[rgba(255,255,255,0.08)]">
            {/* Tab bar */}
            <div className="flex items-center border-b border-[rgba(255,255,255,0.08)]">
              {(["grader", "testcases"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-[16px] text-[12px] font-medium flex items-center gap-[6px] h-[32px] transition-colors ${
                    tab === t
                      ? "text-[#8b5cf6] border-b-2 border-[#8b5cf6]"
                      : "text-[#71717a] hover:text-[#e4e4e7] border-b-2 border-transparent"
                  }`}
                >
                  {t === "grader" ? "Grader" : "Test Cases"}
                  {t === "testcases" && (
                    <span className="min-w-[18px] h-[18px] px-[5px] rounded-full text-[10px] font-semibold bg-[rgba(139,92,246,0.15)] text-[#8b5cf6] inline-flex items-center justify-center">
                      {problem?.testCases?.length || 0}
                    </span>
                  )}
                </button>
              ))}
              {running && (
                <span className="ml-auto mr-[14px] text-[11px] text-[#71717a] animate-pulse">
                  Running...
                </span>
              )}
              {result && !running && (
                <div className="ml-auto mr-[14px] flex items-center gap-2">
                  <VerdictBadge verdict={result.verdict} />
                  <span className="text-[11px] text-[#52525b]">
                    {result.passedTests}/{result.totalTests} · {result.maxRuntime}ms
                  </span>
                </div>
              )}
            </div>

            {/* Panel content */}
            <div className="flex-1 overflow-y-auto p-[12px]">
              {tab === "grader" && (
                <>
                  {!result && !running && (
                    <div className="flex flex-col items-center justify-center h-full gap-2">
                      <div className="w-10 h-10 rounded-full bg-[#1f1f23] flex items-center justify-center">
                        <Play className="w-4 h-4 text-[#52525b]" />
                      </div>
                      <p className="text-[12px] text-[#52525b]">
                        Click <span className="text-[#e4e4e7] font-medium">Run</span> or press{" "}
                        <kbd className="px-[4px] py-[1px] text-[10px] bg-[#1f1f23] border border-white/10 rounded-[3px]">Ctrl+Enter</kbd>
                      </p>
                    </div>
                  )}

                  {result?.compileError && (
                    <div className="p-[10px] rounded-[6px] bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.15)] text-[#ef4444] text-[11px] font-mono whitespace-pre-wrap max-h-[200px] overflow-y-auto mb-2">
                      {result.compileError}
                    </div>
                  )}

                  {result?.results.map((r, i) => (
                    <div key={i} className={`mb-2 p-[10px] rounded-[6px] ${
                      r.verdict === "AC" ? "bg-[rgba(16,185,129,0.06)] border border-[rgba(16,185,129,0.15)]" :
                      r.verdict === "WA" ? "bg-[rgba(239,68,68,0.06)] border border-[rgba(239,68,68,0.15)]" :
                      "bg-[#1f1f23] border border-[rgba(255,255,255,0.08)]"
                    }`}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[11px] text-[#52525b] font-medium">Test #{i + 1}</span>
                        <VerdictBadge verdict={r.verdict} />
                        <span className="ml-auto text-[11px] text-[#52525b]">{r.runtime}ms</span>
                      </div>
                      {r.verdict !== "AC" && (
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          <div>
                            <div className="text-[#ef4444] mb-1 text-[10px] uppercase tracking-wide font-medium">Expected</div>
                            <pre className="text-[#e4e4e7] whitespace-pre-wrap bg-[#0f0f10] p-[8px] rounded-[4px] font-mono max-h-[120px] overflow-y-auto">{r.expected}</pre>
                          </div>
                          <div>
                            <div className="text-[#10b981] mb-1 text-[10px] uppercase tracking-wide font-medium">Got</div>
                            <pre className="text-[#e4e4e7] whitespace-pre-wrap bg-[#0f0f10] p-[8px] rounded-[4px] font-mono max-h-[120px] overflow-y-auto">{r.output}</pre>
                          </div>
                        </div>
                      )}
                      {r.error && <div className="mt-1 text-[11px] text-[#ef4444] font-mono whitespace-pre-wrap">{r.error}</div>}
                    </div>
                  ))}
                </>
              )}

              {tab === "testcases" && (
                <div className="space-y-1">
                  {!problem?.testCases?.length ? (
                    <div className="flex flex-col items-center justify-center h-full gap-2">
                      <p className="text-[12px] text-[#52525b]">No test cases synced yet</p>
                      <p className="text-[11px] text-[#52525b]">Visit the problem on Codeforces to auto-sync</p>
                    </div>
                  ) : (
                    problem.testCases.map((tc, i) => (
                      <details key={tc.id || i} className="group">
                        <summary className="text-[12px] text-[#71717a] cursor-pointer hover:text-[#e4e4e7] py-[6px] px-[6px] rounded-[4px] hover:bg-[#1f1f23] transition-colors select-none">
                          Test #{i + 1} {tc.isSample && <span className="text-[10px] text-[#8b5cf6] ml-1">(sample)</span>}
                        </summary>
                        <div className="grid grid-cols-2 gap-2 mt-1 mb-2 px-[6px]">
                          <div>
                            <div className="text-[10px] text-[#52525b] mb-1 uppercase tracking-wide font-medium">Input</div>
                            <pre className="text-[12px] font-mono bg-[#0f0f10] p-[8px] rounded-[4px] text-[#e4e4e7] whitespace-pre-wrap max-h-[150px] overflow-y-auto">{tc.input}</pre>
                          </div>
                          <div>
                            <div className="text-[10px] text-[#52525b] mb-1 uppercase tracking-wide font-medium">Expected</div>
                            <pre className="text-[12px] font-mono bg-[#0f0f10] p-[8px] rounded-[4px] text-[#e4e4e7] whitespace-pre-wrap max-h-[150px] overflow-y-auto">{tc.output}</pre>
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
