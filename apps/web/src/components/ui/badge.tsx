type BadgeVariant =
  | "cf"
  | "difficulty"
  | "time"
  | "verdict-ac"
  | "verdict-wa"
  | "verdict-tle"
  | "verdict-ce"
  | "verdict-re"
  | "verdict-pending"
  // The three the table was missing. A memory limit, a partial score and "something
  // else" are all real outcomes here — MLE and PARTIAL come from TLX on every scored
  // problem — and each of them used to arrive as an unstyled badge.
  | "verdict-mle"
  | "verdict-partial"
  | "verdict-other";

const variantStyles: Record<BadgeVariant, string> = {
  cf: "bg-[rgba(59,130,246,0.15)] text-[#60a5fa]",
  difficulty: "bg-[rgba(245,158,11,0.15)] text-[#fbbf24]",
  time: "bg-[#1f1f23] text-[#a1a1aa] border border-[rgba(255,255,255,0.08)]",
  "verdict-ac": "bg-[rgba(16,185,129,0.15)] text-[#34d399]",
  "verdict-wa": "bg-[rgba(239,68,68,0.15)] text-[#ef4444]",
  "verdict-tle": "bg-[rgba(245,158,11,0.15)] text-[#f59e0b]",
  "verdict-ce": "bg-[rgba(139,92,246,0.15)] text-[#a78bfa]",
  "verdict-re": "bg-[rgba(239,68,68,0.15)] text-[#ef4444]",
  "verdict-pending": "bg-[#1f1f23] text-[#a1a1aa]",
  // Amber like TLE: a memory limit is the same class of failure as a time limit.
  "verdict-mle": "bg-[rgba(245,158,11,0.15)] text-[#f59e0b]",
  // Scored but not full marks, so neither green nor red: cyan reads as "counted".
  "verdict-partial": "bg-[rgba(6,182,212,0.15)] text-[#22d3ee]",
  "verdict-other": "bg-[#1f1f23] text-[#d4d4d8] border border-[rgba(255,255,255,0.08)]",
};

interface BadgeProps {
  variant?: BadgeVariant;
  className?: string;
  children: React.ReactNode;
}

export default function Badge({ variant = "time", className = "", children }: BadgeProps) {
  // Falls back rather than indexing blind: a variant that is not in the table used to
  // interpolate the literal string "undefined" into className, which rendered a badge
  // with no background and no colour at all.
  const style = variantStyles[variant] ?? variantStyles.time;
  return (
    <span
      className={`inline-flex items-center gap-1 px-[8px] py-[2px] rounded-full text-[11px] font-medium ${style} ${className}`}
    >
      {children}
    </span>
  );
}

/**
 * Folds a judge's own verdict wording onto the nine canonical ones before picking a
 * colour — the same mapping normalizeVerdict does server-side
 * (apps/api/internal/handler/dashboard_verdict.go).
 *
 * This used to be `verdict-${verdict.toLowerCase()}`, which only ever matched six
 * spellings: ac, wa, tle, ce, re, pending. Everything a provider actually sends fell
 * through to an undefined style — Codeforces' own OK, WRONG_ANSWER,
 * TIME_LIMIT_EXCEEDED and COMPILATION_ERROR included, and TLX's "?" for a pending
 * submission. So the Submissions table showed most of its verdicts as bare grey text
 * while the two lists that happened to store short forms were coloured.
 */
export function verdictVariant(verdict: string): BadgeVariant {
  const v = verdict.trim().toUpperCase();
  if (!v) return "verdict-pending";
  if (/^(OK|AC|ACCEPTED)$/.test(v)) return "verdict-ac";
  if (/^(PARTIAL|PARTIALLY_CORRECT|PAC)$/.test(v)) return "verdict-partial";
  if (/^(CE|COMPILATION_ERROR)$/.test(v) || v.includes("COMPIL")) return "verdict-ce";
  if (/^(RTE|RE|RUNTIME_ERROR)$/.test(v) || v.includes("RUNTIME")) return "verdict-re";
  if (/^(TLE|TIME_LIMIT_EXCEEDED)$/.test(v) || v.includes("TIME_LIMIT")) return "verdict-tle";
  // Idleness is a limit too, and Codeforces reports it the same way.
  if (/^(MLE|MEMORY_LIMIT_EXCEEDED|IDLENESS_LIMIT_EXCEEDED)$/.test(v) || v.includes("LIMIT_EXCEEDED")) {
    return "verdict-mle";
  }
  if (/^(WA|WRONG_ANSWER|WRONGANSWER)$/.test(v) || v.includes("WRONG")) return "verdict-wa";
  if (/^(PENDING|TESTING|PND|\?|IN_QUEUE)$/.test(v) || v.includes("TESTING") || v.includes("QUEUE")) {
    return "verdict-pending";
  }
  // SKIPPED, CHALLENGED, REJECTED and anything new: readable, and visibly not an AC.
  return "verdict-other";
}

export function VerdictBadge({ verdict }: { verdict: string }) {
  return <Badge variant={verdictVariant(verdict)}>{verdict}</Badge>;
}
