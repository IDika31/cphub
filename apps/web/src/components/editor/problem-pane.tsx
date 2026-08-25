"use client";

import { FileText, ExternalLink, ListChecks, Clock, Cpu } from "lucide-react";
import Skeleton from "@/components/ui/skeleton";
import ProblemStatement from "@/components/editor/problem-statement";
import type { Problem, TestCase } from "@/lib/api/types";

interface ProblemPaneProps {
  problem: Problem | null;
  loading: boolean;
  sampleCount: number;
  onOpenTests: () => void;
}

function parseTags(raw?: string): string[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.filter((t) => typeof t === "string" && t.length > 0) : [];
  } catch {
    return [];
  }
}

/** Statement zones are labelled and separated by a rule instead of nested cards:
 *  the reader needs to find "Input" while scrolling, not admire a box. */
function Zone({ label, html }: { label: string; html: string }) {
  return (
    <section className="border-t border-[rgba(255,255,255,0.08)] pt-4 mt-4 first:border-t-0 first:pt-0 first:mt-0">
      <h3 className="text-[12px] font-semibold text-[#a1a1aa] mb-2">{label}</h3>
      <ProblemStatement html={html} />
    </section>
  );
}

/** Sample input/output pairs, in the order the provider listed them. Rendered
 *  from the stored test cases so the examples on screen are literally the ones
 *  Run feeds the grader. */
function SampleZone({ samples }: { samples: TestCase[] }) {
  return (
    <section className="border-t border-[rgba(255,255,255,0.08)] pt-4 mt-4">
      <h3 className="text-[12px] font-semibold text-[#a1a1aa] mb-2">
        Contoh{samples.length > 1 ? ` (${samples.length})` : ""}
      </h3>
      <div className="space-y-3">
        {samples.map((tc, i) => (
          <div key={tc.id || i}>
            {samples.length > 1 && (
              <div className="text-[10px] text-[#a1a1aa] uppercase tracking-wide mb-1">
                Contoh {i + 1}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="min-w-0">
                <div className="text-[10px] text-[#a1a1aa] uppercase tracking-wide mb-1 font-medium">Input</div>
                <pre className="text-[12px] font-mono leading-[1.5] bg-[#0f0f10] border border-white/5 rounded-[4px] p-[8px] text-[#e4e4e7] whitespace-pre overflow-x-auto max-h-[220px] overflow-y-auto">
                  {tc.input}
                </pre>
              </div>
              <div className="min-w-0">
                <div className="text-[10px] text-[#a1a1aa] uppercase tracking-wide mb-1 font-medium">Output</div>
                <pre className="text-[12px] font-mono leading-[1.5] bg-[#0f0f10] border border-white/5 rounded-[4px] p-[8px] text-[#e4e4e7] whitespace-pre overflow-x-auto max-h-[220px] overflow-y-auto">
                  {tc.output}
                </pre>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function ProblemPane({ problem, loading, sampleCount, onOpenTests }: ProblemPaneProps) {
  if (loading) {
    return (
      <div className="p-[18px] space-y-4">
        <Skeleton className="h-6 w-2/3" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-24" />
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-3/5" />
      </div>
    );
  }

  if (!problem) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 px-8 text-center">
        <div className="w-11 h-11 rounded-[10px] bg-[#1f1f23] flex items-center justify-center">
          <FileText className="w-5 h-5 text-[#a1a1aa]" aria-hidden="true" />
        </div>
        <p className="text-[13px] text-[#e4e4e7] font-medium">Problem belum ada di database</p>
        <p className="text-[12px] text-[#a1a1aa] max-w-[34ch] leading-relaxed">
          Buka problem-nya di Codeforces atau TLX lalu tekan <kbd className="px-[4px] py-[1px] rounded-[3px] bg-[#1f1f23] border border-white/10 text-[11px] font-mono">Alt+C</kbd>,
          atau sync lewat extension. Editor tetap bisa dipakai untuk coding.
        </p>
      </div>
    );
  }

  const tags = parseTags(problem.tags);
  const hasStatement = Boolean(problem.statement || problem.inputSpec || problem.outputSpec || problem.note);
  // Samples come from the parsed test cases rather than raw HTML — same data the
  // grader runs, so what you read is what Run executes.
  const samples = (problem.testCases ?? []).filter((tc) => tc.isSample && !tc.isCustom);
  const structured = Boolean(problem.inputSpec || problem.outputSpec);

  return (
    <div className="h-full flex flex-col">
      {/* Meta stays put while the statement scrolls: on a long problem you lose
          track of which limits you are coding against. */}
      <header className="flex-shrink-0 bg-[#0f0f10] border-b border-[rgba(255,255,255,0.08)] px-[18px] py-[14px]">
        <h2 className="text-[15px] font-semibold text-[#f4f4f5] leading-snug">{problem.title || problem.problemId}</h2>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2 text-[11px] text-[#a1a1aa]">
          <span className="font-medium text-[#d4d4d8]">{problem.problemId}</span>
          {problem.difficulty > 0 && <span>rating {problem.difficulty}</span>}
          {problem.timeLimit && (
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3" aria-hidden="true" />
              {problem.timeLimit}
            </span>
          )}
          {problem.memoryLimit && (
            <span className="inline-flex items-center gap-1">
              <Cpu className="w-3 h-3" aria-hidden="true" />
              {problem.memoryLimit}
            </span>
          )}
          {sampleCount > 0 && (
            <button
              onClick={onOpenTests}
              className="inline-flex items-center gap-1 text-[#a78bfa] hover:text-[#c4b5fd] hover:underline rounded-[3px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]"
            >
              <ListChecks className="w-3 h-3" aria-hidden="true" />
              {sampleCount} test case
            </button>
          )}
        </div>

        {tags.length > 0 && (
          <ul className="flex flex-wrap gap-1.5 mt-2.5" aria-label="Tags">
            {tags.map((t) => (
              <li
                key={t}
                className="px-[7px] py-[1px] rounded-[4px] text-[10px] bg-[#1f1f23] text-[#a1a1aa] border border-[rgba(255,255,255,0.08)]"
              >
                {t}
              </li>
            ))}
          </ul>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-[18px] py-[16px]">
        {hasStatement ? (
          <div className="max-w-[70ch]">
            {problem.statement && <Zone label="Statement" html={problem.statement} />}
            {problem.inputSpec && <Zone label="Input" html={problem.inputSpec} />}
            {problem.outputSpec && <Zone label="Output" html={problem.outputSpec} />}
            {/* Codeforces order is statement → input → output → examples → note,
                and the pane mirrors it. Only rendered when the provider gave us
                separate spec sections: TLX ships one statement blob that already
                contains its own examples inline, so a second copy would double up. */}
            {structured && samples.length > 0 && <SampleZone samples={samples} />}
            {problem.note && <Zone label="Catatan" html={problem.note} />}
          </div>
        ) : (
          <p className="text-[12px] text-[#a1a1aa] leading-relaxed max-w-[46ch]">
            Statement belum tersimpan untuk problem ini. Sync ulang lewat extension, atau buka
            sumbernya di tab lain.
          </p>
        )}

        {problem.url && (
          <a
            href={problem.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 mt-6 text-[12px] text-[#a78bfa] hover:text-[#c4b5fd] hover:underline rounded-[3px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]"
          >
            Buka di {problem.provider || "sumber"}
            <ExternalLink className="w-3 h-3" aria-hidden="true" />
          </a>
        )}
      </div>
    </div>
  );
}
