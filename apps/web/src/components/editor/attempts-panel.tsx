"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, GitCompare, Download } from "lucide-react";
import { VerdictBadge } from "@/components/ui/badge";
import { fetchProblemAttempts, type ProblemAttempt } from "@/lib/api/problems";
import { diffLines, diffStat, collapseUnchanged } from "@/lib/diff";

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" });
}

/**
 * Every grader run against this problem, code included.
 *
 * The code was always stored — local_submissions.source_code — and never readable, so the
 * one question a finally-solved problem raises ("what did I change?") had no answer in the
 * app that held both versions. The diff is against what is in the editor right now, which
 * is the comparison a person actually wants: this attempt versus what I have.
 */
export default function AttemptsPanel({
  problemId,
  currentCode,
  onUseCode,
  reloadKey,
}: {
  problemId: string;
  currentCode: string;
  onUseCode: (code: string, language: string) => void;
  /** Bumped by the page after a run, so a new attempt shows up without a reload. */
  reloadKey: number;
}) {
  const [attempts, setAttempts] = useState<ProblemAttempt[]>([]);
  const [state, setState] = useState<"loading" | "idle" | "error">("loading");
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState("");

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    fetchProblemAttempts(problemId, 20)
      .then((res) => {
        if (cancelled) return;
        setAttempts(res.data);
        setState("idle");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError((err as Error).message || "Gagal memuat riwayat");
        setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [problemId, reloadKey]);

  const open = attempts.find((a) => a.id === openId);
  const diff = useMemo(
    () => (open ? collapseUnchanged(diffLines(open.sourceCode, currentCode)) : []),
    [open, currentCode],
  );
  const stat = useMemo(
    () => (open ? diffStat(diffLines(open.sourceCode, currentCode)) : { added: 0, removed: 0 }),
    [open, currentCode],
  );

  if (state === "loading") {
    return (
      <div className="h-full flex items-center justify-center gap-2 text-[12px] text-[#a1a1aa]">
        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
        Memuat riwayat...
      </div>
    );
  }

  if (state === "error") {
    return (
      <p role="alert" className="text-[12px] text-[#f87171]">
        {error}
      </p>
    );
  }

  if (attempts.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-1 text-center">
        <p className="text-[12px] text-[#a1a1aa]">Belum ada run untuk problem ini.</p>
        <p className="text-[11px] text-[#71717a]">
          Setiap kali kamu tekan Run, kodenya tersimpan di sini — termasuk yang gagal.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full">
      <ul className="divide-y divide-[rgba(255,255,255,0.06)]">
        {attempts.map((a) => (
          <li key={a.id}>
            <div className="flex items-center gap-3 py-[8px]">
              <VerdictBadge verdict={a.verdict} />
              <span className="text-[11px] text-[#a1a1aa] tabular-nums">{when(a.executedAt)}</span>
              <span className="text-[11px] text-[#71717a]">{a.language}</span>
              {a.totalTests > 0 && (
                <span className="text-[11px] text-[#71717a] tabular-nums">
                  {a.passedTests}/{a.totalTests}
                </span>
              )}
              {a.runtime > 0 && <span className="text-[11px] text-[#71717a] tabular-nums">{a.runtime}ms</span>}

              <div className="ml-auto flex items-center gap-1">
                <button
                  onClick={() => setOpenId(openId === a.id ? "" : a.id)}
                  aria-expanded={openId === a.id}
                  className="inline-flex items-center gap-1 text-[11px] text-[#a1a1aa] hover:text-[#e4e4e7] px-2 py-1 rounded-[4px] hover:bg-[#1f1f23] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]"
                >
                  <GitCompare className="w-3 h-3" aria-hidden="true" />
                  {openId === a.id ? "Tutup diff" : "Diff"}
                </button>
                <button
                  onClick={() => onUseCode(a.sourceCode, a.language)}
                  title="Muat kode ini ke editor"
                  className="inline-flex items-center gap-1 text-[11px] text-[#a1a1aa] hover:text-[#e4e4e7] px-2 py-1 rounded-[4px] hover:bg-[#1f1f23] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]"
                >
                  <Download className="w-3 h-3" aria-hidden="true" />
                  Pakai
                </button>
              </div>
            </div>

            {openId === a.id && (
              <div className="pb-[10px]">
                <p className="text-[11px] text-[#71717a] mb-1">
                  {/* Direction stated, because a diff with no direction is a coin flip:
                      the stored run is the old side, the editor is the new one. */}
                  Run ini → kode di editor sekarang · +{stat.added} −{stat.removed}
                </p>
                {stat.added === 0 && stat.removed === 0 ? (
                  <p className="text-[11px] text-[#a1a1aa]">Identik dengan kode di editor.</p>
                ) : (
                  <pre className="text-[11px] font-mono leading-[1.5] bg-[#0f0f10] border border-white/5 rounded-[4px] p-[8px] overflow-x-auto max-h-[260px] overflow-y-auto">
                    {diff.map((line, i) =>
                      line === null ? (
                        <div key={`gap-${i}`} className="text-[#52525b] select-none">
                          ⋯
                        </div>
                      ) : (
                        <div
                          key={`${line.kind}-${i}`}
                          className={
                            line.kind === "added"
                              ? "text-[#34d399] bg-[rgba(16,185,129,0.08)]"
                              : line.kind === "removed"
                                ? "text-[#f87171] bg-[rgba(239,68,68,0.08)]"
                                : "text-[#a1a1aa]"
                          }
                        >
                          <span className="select-none text-[#52525b]">
                            {line.kind === "added" ? "+" : line.kind === "removed" ? "−" : " "}{" "}
                          </span>
                          {line.text || " "}
                        </div>
                      ),
                    )}
                  </pre>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
