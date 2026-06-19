"use client";

import { useEffect, useRef } from "react";
import { X, CheckCircle2, XCircle, Clock, Loader2, ExternalLink, Trophy } from "lucide-react";

interface SubmitPopupProps {
  open: boolean;
  onClose: () => void;
  problemTitle: string;
  provider: string;
  language: string;
  verdict: string;
  score: number;
  pending: boolean;
  url?: string;
}

const verdictConfig: Record<string, { bg: string; border: string; text: string; icon: typeof CheckCircle2; label: string }> = {
  AC: { bg: "rgba(16,185,129,0.10)", border: "rgba(16,185,129,0.25)", text: "#34d399", icon: CheckCircle2, label: "Accepted" },
  WA: { bg: "rgba(239,68,68,0.10)", border: "rgba(239,68,68,0.25)", text: "#ef4444", icon: XCircle, label: "Wrong Answer" },
  TLE: { bg: "rgba(251,191,36,0.10)", border: "rgba(251,191,36,0.25)", text: "#fbbf24", icon: Clock, label: "Time Limit Exceeded" },
  RTE: { bg: "rgba(239,68,68,0.10)", border: "rgba(239,68,68,0.25)", text: "#ef4444", icon: XCircle, label: "Runtime Error" },
  CE: { bg: "rgba(239,68,68,0.10)", border: "rgba(239,68,68,0.25)", text: "#ef4444", icon: XCircle, label: "Compilation Error" },
  ERR: { bg: "rgba(239,68,68,0.10)", border: "rgba(239,68,68,0.25)", text: "#ef4444", icon: XCircle, label: "Submit Error" },
};

const defaultVerdict = { bg: "rgba(161,161,170,0.10)", border: "rgba(161,161,170,0.25)", text: "#a1a1aa", icon: Clock, label: "Unknown" };

function langLabel(lang: string) {
  const map: Record<string, string> = {
    cpp20: "C++20", cpp17: "C++17", Cpp20: "C++20", Cpp17: "C++17",
    python3: "Python 3", Python3: "Python 3",
    java21: "Java 21", Java17: "Java 17",
    nodejs: "JavaScript",
  };
  return map[lang] || lang;
}

function providerLabel(p: string) {
  return p === "codeforces" ? "Codeforces" : p === "tlx" ? "TLX TOKI" : p;
}

export default function SubmitPopup({
  open, onClose, problemTitle, provider, language, verdict, score, pending, url,
}: SubmitPopupProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleEsc(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [open, onClose]);

  if (!open) return null;

  const cfg = pending
    ? { bg: "rgba(139,92,246,0.10)", border: "rgba(139,92,246,0.25)", text: "#8b5cf6", icon: Loader2, label: "Grading..." }
    : (verdictConfig[verdict] || defaultVerdict);

  const Icon = cfg.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-150">
      <div
        ref={panelRef}
        className="bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-[16px] shadow-2xl w-full max-w-[360px] overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-200"
      >
        {/* Header strip with verdict color */}
        <div
          className="h-[4px] w-full"
          style={{ background: cfg.text }}
        />

        {/* Close button */}
        <div className="flex justify-end px-[14px] pt-[10px]">
          <button
            onClick={onClose}
            className="p-1 rounded-[6px] text-[#71717a] hover:bg-[#1f1f23] hover:text-[#e4e4e7] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Verdict icon + label */}
        <div className="flex flex-col items-center gap-3 px-[24px] pb-[16px]">
          <div
            className="w-[56px] h-[56px] rounded-full flex items-center justify-center"
            style={{ background: cfg.bg, border: `2px solid ${cfg.border}` }}
          >
            <Icon
              className={`w-7 h-7 ${pending ? "animate-spin" : ""}`}
              style={{ color: cfg.text }}
            />
          </div>

          <div className="text-center">
            <div className="text-[18px] font-bold" style={{ color: cfg.text }}>
              {pending ? "Grading..." : cfg.label}
            </div>
            {!pending && score > 0 && (
              <div className="flex items-center justify-center gap-1 mt-1">
                <Trophy className="w-3.5 h-3.5 text-[#fbbf24]" />
                <span className="text-[14px] font-semibold text-[#e4e4e7]">{score}/100</span>
              </div>
            )}
          </div>
        </div>

        {/* Info rows */}
        <div className="border-t border-[rgba(255,255,255,0.06)] mx-[16px]" />
        <div className="px-[24px] py-[14px] space-y-[10px]">
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-[#71717a]">Problem</span>
            <span className="text-[12px] text-[#e4e4e7] font-medium text-right max-w-[200px] truncate">{problemTitle}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-[#71717a]">Language</span>
            <span className="text-[12px] text-[#e4e4e7]">{langLabel(language)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-[#71717a]">Judge</span>
            <span className="text-[12px] text-[#e4e4e7]">{providerLabel(provider)}</span>
          </div>
          {!pending && verdict && verdict !== "ERR" && (
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-[#71717a]">Verdict</span>
              <span className="text-[12px] font-mono font-semibold" style={{ color: cfg.text }}>{verdict}</span>
            </div>
          )}
        </div>

        {/* Footer actions */}
        {url && !pending && (
          <>
            <div className="border-t border-[rgba(255,255,255,0.06)] mx-[16px]" />
            <div className="px-[24px] py-[12px]">
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-[8px] rounded-[8px] bg-[rgba(139,92,246,0.12)] text-[#8b5cf6] text-[12px] font-medium hover:bg-[rgba(139,92,246,0.2)] transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Lihat di {providerLabel(provider)}
              </a>
            </div>
          </>
        )}

        {pending && (
          <>
            <div className="border-t border-[rgba(255,255,255,0.06)] mx-[16px]" />
            <div className="px-[24px] py-[12px]">
              <div className="flex items-center justify-center gap-2 text-[11px] text-[#71717a]">
                <div className="w-1.5 h-1.5 rounded-full bg-[#8b5cf6] animate-pulse" />
                Menunggu hasil dari judge...
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
