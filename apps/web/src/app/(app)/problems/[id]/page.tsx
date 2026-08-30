"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { editor as MonacoEditorNS } from "monaco-editor";
import { useParams } from "next/navigation";
import { Play, RotateCcw, FileCode, Plus, Trash2, UploadCloud, Search } from "lucide-react";
import Topbar from "@/components/shell/topbar";
import Badge, { VerdictBadge } from "@/components/ui/badge";
import Button from "@/components/ui/button";
import Select from "@/components/ui/select";
import MonacoEditor from "@/components/editor/monaco-editor";
import ProblemPane from "@/components/editor/problem-pane";
import NotesPanel from "@/components/editor/notes-panel";
import AttemptsPanel from "@/components/editor/attempts-panel";
import AlgoSearch from "@/components/editor/algo-search";
import Splitter from "@/components/editor/splitter";
import SubmitPopup from "@/components/ui/submit-popup";
import { useToast } from "@/components/ui/toast";
import { fetchProblem } from "@/lib/api/problems";
import { fetchStatementViaExtension } from "@/lib/extension-bridge";
import { runCode, parseTimeLimitMs, parseMemoryLimitMb, type GraderResult } from "@/lib/api/grader";
import { submitTLX, type SubmitTLXResult } from "@/lib/api/tlx";
import { submitCFPreferBrowser } from "@/lib/api/codeforces";
import { isTLXFamily } from "@/lib/providers";
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

/** Peak RSS comes back in KB; MB reads better past a megabyte. */
function formatKB(kb: number) {
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
}

export default function ProblemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [problem, setProblem] = useState<Problem | null>(null);
  const [loading, setLoading] = useState(true);
  const [language, setLanguage] = useState("cpp20");
  const [code, setCode] = useState("");
  const [result, setResult] = useState<GraderResult | null>(null);
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<SubmitTLXResult | null>(null);
  const [submitError, setSubmitError] = useState("");
  const [popupOpen, setPopupOpen] = useState(false);
  const [tab, setTab] = useState<"grader" | "testcases" | "notes" | "attempts">("grader");
  // Bumped after a run so the attempts list picks up the row the grader just wrote.
  const [attemptsKey, setAttemptsKey] = useState(0);
  // Pane sizes live here as percentages so the ratio survives a window resize.
  const [leftPct, setLeftPct] = useState(42);
  const [editorPct, setEditorPct] = useState(62);
  const rowRef = useRef<HTMLDivElement>(null);
  const colRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<MonacoEditorNS.IStandaloneCodeEditor | null>(null);
  // Persistence keys must not depend on how the user got here. The Problemset links
  // to /problems/<uuid>, the extension deep-links /problems/<cfRef>, and the fetch
  // below accepts either — so keying storage on the raw param gave the same problem
  // two independent buffers and work written from one entry point was invisible from
  // the other. Held in a ref, not state, so the debounced saver is not recreated
  // (dropping its pending timer) when the fetch resolves.
  const keyIdRef = useRef(id);
  const [customTests, setCustomTests] = useState<{ input: string; output: string }[]>([]);
  const [algoOpen, setAlgoOpen] = useState(false);
  const { addToast } = useToast();

  // Ctrl/Cmd+K opens the algorithm palette. Registered in the capture phase so
  // it still fires while Monaco has focus — Monaco binds Ctrl+K itself.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        e.stopPropagation();
        setAlgoOpen((v) => !v);
      }
    }
    document.addEventListener("keydown", onKey, { capture: true });
    return () => document.removeEventListener("keydown", onKey, { capture: true });
  }, []);

  // Load custom test cases (manual, persisted per problem) — provider-agnostic
  useEffect(() => {
    if (!id) return;
    try {
      const raw = localStorage.getItem(`cphub_customtests_${id}`);
      setCustomTests(raw ? (JSON.parse(raw) as { input: string; output: string }[]) : []);
    } catch {
      setCustomTests([]);
    }
  }, [id]);

  function persistCustomTests(next: { input: string; output: string }[]) {
    setCustomTests(next);
    const target = keyIdRef.current || id;
    if (target) localStorage.setItem(`cphub_customtests_${target}`, JSON.stringify(next));
  }

  // Switch persistence to the problem's own id and copy the param-keyed buffers
  // forward once. Both keys can hold work — the two entry paths wrote them
  // independently — so the canonical copy wins and the legacy one is only read when
  // there is nothing under the canonical key yet.
  function adoptCanonicalId(canonical: string) {
    keyIdRef.current = canonical;
    if (canonical === id) return;
    try {
      const canonicalRaw = localStorage.getItem(`cphub_customtests_${canonical}`);
      const legacyRaw = localStorage.getItem(`cphub_customtests_${id}`);
      if (canonicalRaw) {
        setCustomTests(JSON.parse(canonicalRaw) as { input: string; output: string }[]);
      } else if (legacyRaw) {
        localStorage.setItem(`cphub_customtests_${canonical}`, legacyRaw);
        setCustomTests(JSON.parse(legacyRaw) as { input: string; output: string }[]);
      }
    } catch {
      // A corrupt buffer is not worth failing the page load over.
    }
  }

  // Per (problem, language), because the legacy key holds a separate buffer for each
  // language: read the canonical buffer, else adopt the param-keyed one.
  function loadCodeFor(canonical: string, lang: string) {
    let saved = loadFromLocalStorage(canonical, lang);
    if (!saved && canonical !== id) {
      const legacy = loadFromLocalStorage(id, lang);
      if (legacy) {
        saveToLocalStorage(canonical, lang, legacy);
        saved = legacy;
      }
    }
    return saved;
  }

  function addCustomTest() {
    persistCustomTests([...customTests, { input: "", output: "" }]);
    setTab("testcases");
  }

  function updateCustomTest(i: number, field: "input" | "output", value: string) {
    const next = customTests.map((t, idx) => (idx === i ? { ...t, [field]: value } : t));
    persistCustomTests(next);
  }

  function removeCustomTest(i: number) {
    persistCustomTests(customTests.filter((_, idx) => idx !== i));
  }

  // Load problem
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    keyIdRef.current = id;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(id);
    const token = getToken();
    const promise = isUuid
      ? fetchProblem(id)
      : apiClient('/api/problems/by-problem-id/' + id, { token });
    promise
      .then((raw) => {
        const p = raw as Problem;
        setProblem(p);
        // A Codeforces row synced from the problemset API carries rating and tags but
        // no statement — the API has no method that returns one. Rather than have the
        // server scrape it (a Cloudflare solve, i.e. a headless Chromium), this
        // browser reads the page it can already reach and posts it to CPHub. Silent
        // when there is no extension: the server keeps its own fallback, behind a
        // cooldown.
        if (p.provider === "codeforces" && !p.statement && p.problemId) {
          fetchStatementViaExtension(p.problemId)
            .then(() => {
              // Only refresh what is still on screen; the user may have moved on
              // while the tab loaded.
              if (keyIdRef.current !== id) return;
              return apiClient('/api/problems/by-problem-id/' + p.problemId, { token })
                .then((fresh) => setProblem(fresh as Problem))
                .catch(() => {/* the statement is stored; the next open will show it */});
            })
            .catch(() => {/* no extension, or Codeforces unreachable from this browser */});
        }
        const canonical = p.id || id;
        adoptCanonicalId(canonical);
        const saved = loadCodeFor(canonical, language);
        // Ignore saved code that still has raw placeholders (from buggy version)
        const hasPlaceholders = saved && /\{(provider|problemId|title|problemGroup)\}/.test(saved);
        if (saved && !hasPlaceholders) {
          setCode(saved);
        } else {
          const tpl = getDefaultTemplate(language);
          const vars: Record<string, string> = {
            provider: p.provider || "cf",
            problemId: p.problemId || id,
            title: p.title || "",
            problemGroup: (p as unknown as Record<string, string>).problemGroup || "",
          };
          setCode(applyTemplate(tpl, vars));
        }
      })
      .catch((err) => {
        // A failed load must never clobber the autosave buffer: localStorage is the
        // only place the user's code lives, and one keystroke would persist the
        // template over it 300ms later. Mirror the success branch instead — saved
        // code first, template only when there is none. Not-in-DB problems 404 here
        // and are still editable, so this path is a normal workflow, not an edge case.
        const saved = loadCodeFor(keyIdRef.current || id, language);
        const hasPlaceholders = saved && /\{(provider|problemId|title|problemGroup)\}/.test(saved);
        if (saved && !hasPlaceholders) {
          setCode(saved);
        } else {
          // Through applyTemplate, not the raw template: a raw {provider} left in the
          // buffer is exactly what the guard above discards on the next good load.
          setCode(
            applyTemplate(getDefaultTemplate(language), {
              provider: "cf",
              problemId: id,
              title: "",
              problemGroup: "",
            }),
          );
        }
        addToast("error", `Gagal memuat problem: ${(err as Error).message || "cek koneksi & login"}`);
      })
      .finally(() => setLoading(false));
  }, [id]);

  // Auto-save on code change (300ms debounce)
  const saveCode = useCallback(
    debounce((code: string, lang: string) => {
      const target = keyIdRef.current || id;
      if (target) saveToLocalStorage(target, lang, code);
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
    const saved = loadCodeFor(keyIdRef.current || id, lang);
    setCode(saved || getDefaultTemplate(lang));
  }

  // Run grader
  async function handleRun() {
    if (!code.trim()) return;
    setRunning(true);
    setResult(null);
    setTab("grader");
    try {
      const testCases = [
        ...(problem?.testCases || []).map((tc) => ({
          input: tc.input,
          output: tc.output,
        })),
        ...customTests.filter((t) => t.input !== "" || t.output !== ""),
      ];
      if (testCases.length === 0) {
        // If no test cases, run with empty
        testCases.push({ input: "", output: "" });
      }
      const res = await runCode(
        {
          language,
          sourceCode: code,
          testCases,
          timeLimitMs: parseTimeLimitMs(problem?.timeLimit),
          memoryLimitMB: parseMemoryLimitMb(problem?.memoryLimit),
          problemId: problem?.id || id,
        },
        getToken(),
      );
      setResult(res);
      // The grader wrote a local_submissions row for this run, so the history tab has
      // something new to show — and it is the run the user is looking at right now.
      setAttemptsKey((k) => k + 1);
    } catch (err) {
      // Silent failure here looked identical to "compiled fine, no output".
      addToast("error", `Grader gagal: ${(err as Error).message || "cek API & compiler di host"}`);
    }
    setRunning(false);
  }

  async function handleSubmitExternal() {
    if (!code.trim() || !problem) return;
    setSubmitting(true);
    setSubmitResult(null);
    setSubmitError("");
    setPopupOpen(true);
    try {
      // Codeforces has no submit API. The extension posts the form from the user's
      // own browser when it is installed — that browser already holds the session and
      // the Cloudflare clearance — and the server falls back to its own session when
      // it is not. TLX has a real API and takes the token. All paths answer with a
      // verdict, so the popup below does not care which judge or which route it was.
      const res =
        problem.provider === "codeforces"
          ? await submitCFPreferBrowser(problem, code, language).then((r) => ({
              submissionJid: String(r.submissionId),
              verdict: r.verdict,
              score: 0,
              pending: r.pending,
              url: r.url,
            }))
          : await submitTLX(problem.id, code, language, getToken());
      setSubmitResult(res);
      if (res.verdict === "AC" || res.verdict === "OK") {
        setProblem({ ...problem, status: "solved" });
      }
    } catch (err: unknown) {
      setSubmitResult({
        submissionJid: "",
        verdict: "ERR",
        score: 0,
        pending: false,
        url: "",
      });
      setSubmitError((err as Error).message || "");
      addToast("error", `Submit gagal: ${(err as Error).message || "cek koneksi & akun di Connections"}`);
    }
    setSubmitting(false);
  }

  // DataAlgo import: drop the snippet at the caret. A line that already has code
  // gets the snippet on its own fresh line instead of being cut in half.
  function insertSnippet(snippet: string, name: string) {
    const ed = editorRef.current;
    if (!ed) {
      // Editor not mounted yet: append instead of swallowing the click.
      const next = code + (code.endsWith("\n") ? "" : "\n") + snippet + "\n";
      setCode(next);
      saveCode(next, language);
      return;
    }
    const pos = ed.getPosition();
    const model = ed.getModel();
    if (!pos || !model) return;

    const line = model.getLineContent(pos.lineNumber);
    const onBlankLine = line.trim() === "";
    const text = onBlankLine ? snippet : "\n" + snippet;
    const range = onBlankLine
      ? { startLineNumber: pos.lineNumber, startColumn: 1, endLineNumber: pos.lineNumber, endColumn: line.length + 1 }
      : { startLineNumber: pos.lineNumber, startColumn: line.length + 1, endLineNumber: pos.lineNumber, endColumn: line.length + 1 };

    ed.pushUndoStop();
    ed.executeEdits("dataalgo", [{ range, text, forceMoveMarkers: true }]);
    ed.pushUndoStop();
    ed.focus();
    console.info("[dataalgo] imported", name);
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
    const target = keyIdRef.current || id;
    if (target) saveToLocalStorage(target, language, newCode);
  }

  function handleReset() {
    const saved = loadCodeFor(keyIdRef.current || id, language);
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
            <div className="flex-1" />
            <Button
              variant="default"
              onClick={() => setAlgoOpen(true)}
              title="Cari algoritma dari DataAlgo dan sisipkan di kursor (Ctrl+K)"
            >
              <Search className="w-3 h-3" aria-hidden="true" /> Algo
              <kbd className="ml-1 hidden sm:inline-flex items-center px-[4px] text-[10px] font-mono bg-[#0f0f10] border border-[rgba(255,255,255,0.16)] rounded-[3px] text-[#a1a1aa]">
                Ctrl+K
              </kbd>
            </Button>
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
            {/* Self-hosted TLX instances submit through the same endpoint as the
                official one, so the button follows the family rather than the exact
                provider string. */}
            {(isTLXFamily(problem.provider) || problem.provider === "codeforces") && (
              <Button variant="default" onClick={handleSubmitExternal} disabled={submitting}>
                <UploadCloud className="w-3 h-3" />{" "}
                {submitting
                  ? "Submitting..."
                  : problem.provider === "codeforces"
                    ? "Submit CF"
                    : "Submit TLX"}
              </Button>
            )}
            {submitResult && (
              submitResult.verdict === "ERR" ? (
                // Not a judge verdict — the submit never reached the judge. This used
                // to render VerdictBadge "RE", which is this app's real Runtime Error
                // verdict (grader/languages.go), so an expired Codeforces session was
                // displayed as a crash on Codeforces. Still red: a failed submit
                // should stay alarming, it is the label that was the lie.
                <button
                  onClick={() => setPopupOpen(true)}
                  title={submitError || "Submit gagal — klik untuk detail"}
                >
                  <Badge variant="verdict-re">Gagal kirim</Badge>
                </button>
              ) : submitResult.pending ? (
                <button onClick={() => setPopupOpen(true)}>
                  <VerdictBadge verdict="PENDING" />
                </button>
              ) : (
                <button onClick={() => setPopupOpen(true)} title="Lihat hasil submit">
                  <VerdictBadge verdict={submitResult.verdict} />
                </button>
              )
            )}
          </>
        )}
      </Topbar>

      <div ref={rowRef} className="flex-1 flex min-h-0">
        {/* Left: statement */}
        <div
          style={{ width: `${leftPct}%` }}
          className="flex-shrink-0 min-w-0 bg-[#18181b] border-r border-[rgba(255,255,255,0.08)]"
        >
          <ProblemPane
            problem={problem}
            loading={loading}
            sampleCount={(problem?.testCases?.length || 0) + customTests.length}
            onOpenTests={() => setTab("testcases")}
          />
        </div>

        <Splitter
          orientation="vertical"
          value={leftPct}
          onChange={setLeftPct}
          containerRef={rowRef}
          min={22}
          max={70}
          label="Ubah lebar panel problem"
        />

        {/* Right: Editor + Grader */}
        <div ref={colRef} className="flex-1 flex flex-col min-w-0">
          {/* Editor */}
          <div style={{ height: `${editorPct}%` }} className="min-h-0">
            {loading ? (
              <div className="h-full flex items-center justify-center bg-[#0f0f10]">
                <div className="text-[13px] text-[#a1a1aa]">Menyiapkan editor...</div>
              </div>
            ) : (
              <MonacoEditor
                key={id}
                value={code || getDefaultTemplate(language)}
                language={language}
                onChange={handleCodeChange}
                onRun={handleRun}
                onMount={(ed) => {
                  editorRef.current = ed;
                }}
              />
            )}
          </div>

          <Splitter
            orientation="horizontal"
            value={editorPct}
            onChange={setEditorPct}
            containerRef={colRef}
            min={25}
            max={85}
            label="Ubah tinggi editor"
          />

          {/* Bottom Panel */}
          <div className="flex-1 min-h-0 bg-[#18181b] flex flex-col border-t border-[rgba(255,255,255,0.08)]">
            {/* Tab bar */}
            <div className="flex items-center border-b border-[rgba(255,255,255,0.08)]" role="tablist" aria-label="Panel bawah">
              {([
                { id: "grader", label: "Grader" },
                { id: "testcases", label: "Test Cases" },
                { id: "notes", label: "Catatan" },
                { id: "attempts", label: "Riwayat" },
              ] as const).map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  role="tab"
                  id={`panel-tab-${t.id}`}
                  aria-selected={tab === t.id}
                  aria-controls="editor-bottom-panel"
                  className={`px-[14px] text-[12px] font-medium flex items-center gap-[6px] h-[32px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#8b5cf6] ${
                    tab === t.id
                      ? "text-[#a78bfa] border-b-2 border-[#8b5cf6]"
                      : "text-[#a1a1aa] hover:text-[#e4e4e7] border-b-2 border-transparent"
                  }`}
                >
                  {t.label}
                  {t.id === "testcases" && (
                    <span className="min-w-[18px] h-[18px] px-[5px] rounded-full text-[10px] font-semibold bg-[rgba(139,92,246,0.15)] text-[#a78bfa] inline-flex items-center justify-center">
                      {(problem?.testCases?.length || 0) + customTests.length}
                    </span>
                  )}
                </button>
              ))}
              {running && (
                <span className="ml-auto mr-[14px] text-[11px] text-[#a1a1aa] animate-pulse">
                  Running...
                </span>
              )}
              {result && !running && (
                <div className="ml-auto mr-[14px] flex items-center gap-2">
                  <VerdictBadge verdict={result.verdict} />
                  <span className="text-[11px] text-[#a1a1aa] tabular-nums">
                    {result.passedTests}/{result.totalTests} · {result.maxRuntime}ms
                    {result.maxMemory > 0 && ` · ${formatKB(result.maxMemory)}`}
                  </span>
                </div>
              )}
            </div>

            {/* Panel content */}
            <div
              id="editor-bottom-panel"
              role="tabpanel"
              aria-labelledby={`panel-tab-${tab}`}
              className="flex-1 min-h-0 overflow-y-auto p-[12px]"
            >
              {tab === "grader" && (
                <>
                  {!result && !running && (
                    <div className="flex flex-col items-center justify-center h-full gap-2">
                      <div className="w-10 h-10 rounded-full bg-[#1f1f23] flex items-center justify-center">
                        <Play className="w-4 h-4 text-[#a1a1aa]" aria-hidden="true" />
                      </div>
                      <p className="text-[12px] text-[#a1a1aa]">
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
                        <span className="text-[11px] text-[#a1a1aa] font-medium">Test #{i + 1}</span>
                        <VerdictBadge verdict={r.verdict} />
                        <span className="ml-auto text-[11px] text-[#a1a1aa] tabular-nums">
                          {r.runtime}ms
                          {r.memory > 0 && ` · ${formatKB(r.memory)}`}
                        </span>
                      </div>
                      {/* A case with no expected output is not judged at all (see the
                          grader handler), so it comes back AC — but printing nothing
                          would hide the very stdout the user pressed Run to read. Show
                          Got on its own, without an empty red Expected box. */}
                      {(r.verdict !== "AC" || r.expected.trim() === "") && (
                        <div className={`grid ${r.expected.trim() === "" ? "grid-cols-1" : "grid-cols-2"} gap-2 text-[11px]`}>
                          {r.expected.trim() !== "" && (
                            <div>
                              <div className="text-[#ef4444] mb-1 text-[10px] font-semibold">Expected</div>
                              <pre className="text-[#e4e4e7] whitespace-pre-wrap bg-[#0f0f10] p-[8px] rounded-[4px] font-mono max-h-[120px] overflow-y-auto">{r.expected}</pre>
                            </div>
                          )}
                          <div>
                            <div className="text-[#10b981] mb-1 text-[10px] font-semibold">Got</div>
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
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] text-[#a1a1aa]">
                      {(problem?.testCases?.length || 0)} sync · {customTests.length} manual
                    </span>
                    <Button variant="ghost" onClick={addCustomTest}>
                      <Plus className="w-3 h-3" /> Tambah Test Case
                    </Button>
                  </div>

                  {!problem?.testCases?.length && customTests.length === 0 && (
                    <div className="flex flex-col items-center justify-center gap-2 py-6">
                      <p className="text-[12px] text-[#a1a1aa]">No test cases synced yet</p>
                      {problem?.provider === "codeforces" ? (
                        <p className="text-[11px] text-[#a1a1aa]">Buka problem di Codeforces lalu klik Sync via extension</p>
                      ) : problem?.provider === "tlx" ? (
                        <p className="text-[11px] text-[#a1a1aa]">TLX tidak mengekspos sample lewat API — tambah test case manual atau submit di TLX</p>
                      ) : (
                        <p className="text-[11px] text-[#a1a1aa]">Sync problem via extension atau tambah test case manual</p>
                      )}
                    </div>
                  )}

                  {problem?.testCases?.map((tc, i) => (
                    <details key={tc.id || i} className="group">
                      <summary className="text-[12px] text-[#a1a1aa] cursor-pointer hover:text-[#e4e4e7] py-[6px] px-[6px] rounded-[4px] hover:bg-[#1f1f23] transition-colors select-none">
                        Test #{i + 1} {tc.isSample && <span className="text-[10px] text-[#a78bfa] ml-1">(sample)</span>}
                      </summary>
                      <div className="grid grid-cols-2 gap-2 mt-1 mb-2 px-[6px]">
                        <div>
                          <div className="text-[10px] text-[#a1a1aa] mb-1 uppercase tracking-wide font-medium">Input</div>
                          <pre className="text-[12px] font-mono bg-[#0f0f10] p-[8px] rounded-[4px] text-[#e4e4e7] whitespace-pre-wrap max-h-[150px] overflow-y-auto">{tc.input}</pre>
                        </div>
                        <div>
                          <div className="text-[10px] text-[#a1a1aa] mb-1 uppercase tracking-wide font-medium">Expected</div>
                          <pre className="text-[12px] font-mono bg-[#0f0f10] p-[8px] rounded-[4px] text-[#e4e4e7] whitespace-pre-wrap max-h-[150px] overflow-y-auto">{tc.output}</pre>
                        </div>
                      </div>
                    </details>
                  ))}

                  {customTests.map((tc, i) => (
                    <div key={`custom-${i}`} className="border border-[rgba(255,255,255,0.08)] rounded-[6px] p-[8px] mb-2">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] text-[#a78bfa] font-medium">Manual #{i + 1}</span>
                        <button
                          onClick={() => removeCustomTest(i)}
                          title="Hapus test case"
                          className="p-[3px] rounded text-[#a1a1aa] hover:text-[#ef4444] transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div className="text-[10px] text-[#a1a1aa] mb-1 uppercase tracking-wide font-medium">Input</div>
                          <textarea
                            value={tc.input}
                            onChange={(e) => updateCustomTest(i, "input", e.target.value)}
                            aria-label={`Input test manual ${i + 1}`}
                            rows={4}
                            placeholder="stdin..."
                            className="w-full text-[12px] font-mono bg-[#0f0f10] p-[8px] rounded-[4px] text-[#e4e4e7] border border-[rgba(255,255,255,0.08)] focus:outline-none focus:border-[#8b5cf6] resize-y"
                          />
                        </div>
                        <div>
                          <div className="text-[10px] text-[#a1a1aa] mb-1 uppercase tracking-wide font-medium">Expected (opsional)</div>
                          <textarea
                            value={tc.output}
                            onChange={(e) => updateCustomTest(i, "output", e.target.value)}
                            aria-label={`Expected output test manual ${i + 1}`}
                            rows={4}
                            placeholder="expected output..."
                            className="w-full text-[12px] font-mono bg-[#0f0f10] p-[8px] rounded-[4px] text-[#e4e4e7] border border-[rgba(255,255,255,0.08)] focus:outline-none focus:border-[#8b5cf6] resize-y"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Both of these are per viewer, unlike everything else about a problem:
                  the note is what this person worked out, the history is what this
                  person ran. Keyed on the canonical id so they follow the problem and
                  not the URL the user happened to arrive by. */}
              {tab === "notes" && <NotesPanel problemId={keyIdRef.current || id} />}

              {tab === "attempts" && (
                <AttemptsPanel
                  problemId={keyIdRef.current || id}
                  currentCode={code}
                  reloadKey={attemptsKey}
                  onUseCode={(source, lang) => {
                    // Loading an old attempt sets the language too: reading C++ into a
                    // Python buffer would compile the wrong thing on the next Run.
                    if (lang && lang !== language) setLanguage(lang);
                    handleCodeChange(source);
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      <AlgoSearch open={algoOpen} onClose={() => setAlgoOpen(false)} onImport={insertSnippet} />

      {problem && (
        <SubmitPopup
          open={popupOpen}
          onClose={() => setPopupOpen(false)}
          problemTitle={problem.title || ""}
          provider={problem.provider || "tlx"}
          language={language}
          verdict={submitResult?.verdict || ""}
          score={submitResult?.score || 0}
          pending={submitting || (submitResult?.pending ?? false)}
          url={submitResult?.url}
        />
      )}
    </>
  );
}
