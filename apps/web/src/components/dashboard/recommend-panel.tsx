"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import Badge from "@/components/ui/badge";
import Skeleton from "@/components/ui/skeleton";
import { Panel, EmptyPanel } from "@/components/dashboard/panels";
import type { Recommendation, RecommendationBasis } from "@/lib/api/dashboard";

/** Reads the JSON array the problems table stores tags in. Same shape the problemset
 *  list handles, kept local because it is two lines and one caller. */
function tagsOf(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return [];
  }
}

/** Says out loud what the picks were based on. A recommender that will not explain itself
 *  is one the user has to take on faith, and the data behind this one is theirs. */
function basisLabel(basis?: RecommendationBasis): string {
  if (!basis) return "";
  const [lo, hi] = basis.band;
  const band = `${lo}–${hi}`;
  const from =
    basis.ratingFrom === "rating"
      ? `rating Codeforces kamu · ${band}`
      : basis.ratingFrom === "solved"
        ? `rata-rata problem yang sudah kamu selesaikan · ${band}`
        : `belum ada riwayat, jadi dari rentang pemula · ${band}`;
  if (basis.weakTags.length === 0) return from;
  return `${from} · tag terlemah: ${basis.weakTags.join(", ")}`;
}

/**
 * "Kerjakan berikutnya": unsolved Codeforces problems in the user's own rating band,
 * drawn from the tags they fail at.
 *
 * Codeforces only, because it is the provider whose problems carry both a difficulty and
 * tags — the two things that make a pick explainable. A TLX-only user sees the empty
 * state rather than an arbitrary list.
 */
export function RecommendPanel({
  data,
  basis,
  loading,
  error,
}: {
  data: Recommendation[];
  basis?: RecommendationBasis;
  loading?: boolean;
  error?: string;
}) {
  if (loading) {
    return (
      <Panel title="Kerjakan berikutnya">
        <div className="space-y-2">
          <Skeleton className="h-[18px] w-[220px]" />
          <Skeleton className="h-[44px] w-full" />
          <Skeleton className="h-[44px] w-full" />
          <Skeleton className="h-[44px] w-full" />
        </div>
      </Panel>
    );
  }

  if (error) {
    return (
      <Panel title="Kerjakan berikutnya">
        <EmptyPanel message="Gagal memuat rekomendasi." hint={error} />
      </Panel>
    );
  }

  if (data.length === 0) {
    return (
      <Panel title="Kerjakan berikutnya">
        <EmptyPanel
          message="Belum ada yang bisa direkomendasikan."
          hint={
            <>
              Rekomendasi dibaca dari submission Codeforces yang sudah tersync dan dari
              problemset yang sudah diimpor — sync keduanya dulu, lalu buka halaman ini lagi.
            </>
          }
        />
      </Panel>
    );
  }

  return (
    <Panel
      title="Kerjakan berikutnya"
     
      subtitle={basisLabel(basis)}
    >
      <ul className="space-y-1">
        {data.map((r) => (
          <li key={r.problemId}>
            <Link
              href={`/problems/${encodeURIComponent(r.problemId)}`}
              className="group flex items-center gap-3 px-[10px] py-[8px] rounded-[6px] hover:bg-[#1f1f23] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]"
            >
              <span className="text-[11px] text-[#71717a] tabular-nums w-[46px] flex-shrink-0">
                {r.problemId}
              </span>
              <span className="text-[13px] text-[#e4e4e7] flex-1 min-w-0 truncate">{r.title}</span>
              {/* The reason, in the row it explains: a tag name when the pick came from a
                  weakness, and nothing when it came from the rating band alone — the
                  subtitle already said that part. */}
              {r.reason !== "level" && (
                <span className="text-[11px] text-[#a78bfa] bg-[rgba(139,92,246,0.12)] rounded-full px-2 py-[1px] flex-shrink-0">
                  {r.reason}
                </span>
              )}
              {r.difficulty > 0 && <Badge variant="difficulty">{r.difficulty}</Badge>}
              <ArrowRight
                className="w-3.5 h-3.5 text-[#71717a] group-hover:text-[#a78bfa] group-hover:translate-x-0.5 transition-all flex-shrink-0"
                aria-hidden="true"
              />
            </Link>
            {tagsOf(r.tags).length > 0 && (
              <p className="text-[11px] text-[#71717a] px-[10px] pb-[6px] truncate">
                {tagsOf(r.tags).join(" · ")}
              </p>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
