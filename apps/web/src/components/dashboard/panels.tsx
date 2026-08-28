"use client";

import type { ReactNode } from "react";
import Skeleton from "@/components/ui/skeleton";

/** Shared chrome for every dashboard block, so the page reads as one grid
 *  instead of a pile of differently-padded boxes. */
export function Panel({
  title, subtitle, action, children, className = "",
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-[8px] p-[16px] ${className}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold text-[#e4e4e7]">{title}</h2>
          {subtitle && <p className="text-[11px] text-[#a1a1aa] mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function StatCard({
  label, value, sub, accent = "#a78bfa", icon, loading,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  icon?: ReactNode;
  loading?: boolean;
}) {
  return (
    <div className="bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-[8px] p-[16px] hover:border-[rgba(255,255,255,0.16)] transition-colors">
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="text-[11px] text-[#a1a1aa] uppercase tracking-wide truncate">{label}</div>
        {icon && (
          <div
            className="w-6 h-6 rounded-[6px] flex items-center justify-center flex-shrink-0"
            style={{ background: `${accent}26`, color: accent }}
          >
            {icon}
          </div>
        )}
      </div>
      {loading ? (
        <Skeleton className="h-[34px] w-[60px] my-[1px]" />
      ) : (
        <div className="text-[26px] font-bold text-[#e4e4e7] leading-tight tabular-nums">{value}</div>
      )}
      {/* Hidden while loading, like the value above it. The sub line is built from the
          same numbers, so leaving it up during the first request printed a confident
          "0 solved" under a skeleton — a figure nobody had answered yet. */}
      {!loading && sub && <div className="text-[11px] text-[#a1a1aa] mt-1 truncate">{sub}</div>}
    </div>
  );
}

export function EmptyPanel({ message, hint }: { message: string; hint?: ReactNode }) {
  return (
    <div className="min-h-[120px] flex flex-col items-center justify-center gap-1 text-center">
      <p className="text-[13px] text-[#a1a1aa]">{message}</p>
      {hint}
    </div>
  );
}

export const VERDICT_COLORS: Record<string, string> = {
  AC: "#34d399",
  PARTIAL: "#fbbf24",
  WA: "#f87171",
  TLE: "#f59e0b",
  MLE: "#fb923c",
  RTE: "#f472b6",
  CE: "#a78bfa",
  PENDING: "#a1a1aa",
  OTHER: "#71717a",
};

export const VERDICT_LABELS: Record<string, string> = {
  AC: "Accepted",
  PARTIAL: "Partial",
  WA: "Wrong Answer",
  TLE: "Time Limit",
  MLE: "Memory Limit",
  RTE: "Runtime Error",
  CE: "Compile Error",
  PENDING: "Pending",
  OTHER: "Lainnya",
};

/** Horizontal proportion bars. Used for verdicts, languages and difficulty —
 *  a bar list stays readable at any count, unlike a pie with nine slices. */
export function BarList({
  rows, total, formatValue,
}: {
  rows: Array<{ key: string; label: string; value: number; color: string; note?: string }>;
  total: number;
  formatValue?: (value: number) => string;
}) {
  const safeTotal = total > 0 ? total : 1;
  return (
    <ul className="space-y-2">
      {rows.map((r) => {
        const pct = (r.value / safeTotal) * 100;
        return (
          <li key={r.key} className="flex items-center gap-3">
            <span className="text-[12px] text-[#e4e4e7] w-[104px] truncate" title={r.label}>
              {r.label}
            </span>
            <div className="flex-1 h-[8px] bg-[#1f1f23] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${Math.max(pct, r.value > 0 ? 2 : 0)}%`, background: r.color }}
              />
            </div>
            <span className="text-[11px] font-medium text-[#e4e4e7] w-[52px] text-right tabular-nums">
              {formatValue ? formatValue(r.value) : r.value}
            </span>
            <span className="text-[11px] text-[#a1a1aa] w-[44px] text-right tabular-nums">
              {pct.toFixed(0)}%
            </span>
          </li>
        );
      })}
    </ul>
  );
}
