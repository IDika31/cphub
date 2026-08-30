"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Lightbulb, RefreshCw } from "lucide-react";
import Topbar from "@/components/shell/topbar";
import Button from "@/components/ui/button";
import { RecommendPanel } from "@/components/dashboard/recommend-panel";
import {
  fetchRecommendations,
  type Recommendation,
  type RecommendationBasis,
} from "@/lib/api/dashboard";

/** More than the dashboard panel used to show. This page is where someone comes to choose
 *  what to work on, so the list is long enough to skim rather than a teaser. */
const PAGE_LIMIT = 20;

/**
 * Latihan: what to solve next, on its own page.
 *
 * It started as a dashboard panel and did not belong there — the dashboard answers "how am
 * I doing", which is a page you read, while this one answers "what now", which is a page
 * you act from. Same endpoint, more room, and the weak tags become filters instead of a
 * sentence.
 */
export default function PracticePage() {
  const [data, setData] = useState<Recommendation[]>([]);
  const [basis, setBasis] = useState<RecommendationBasis | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tag, setTag] = useState("");

  const load = useCallback(async (activeTag: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchRecommendations(PAGE_LIMIT, activeTag || undefined);
      setData(res.data);
      setBasis(res.basis);
    } catch (err) {
      setError((err as Error).message || "Gagal memuat rekomendasi");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(tag);
  }, [load, tag]);

  // The chips the server offers, minus nothing: filtering to a tag the user has a record
  // in is always a sensible question, even one they are already good at.
  const options = basis?.tagOptions ?? [];

  return (
    <>
      <Topbar title="Latihan">
        <Button variant="default" onClick={() => void load(tag)} disabled={loading}>
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          {loading ? "Memuat..." : "Muat ulang"}
        </Button>
      </Topbar>

      <div className="flex-1 overflow-y-auto p-[14px] space-y-4">
        <div className="flex items-start gap-3 bg-[rgba(139,92,246,0.06)] border border-[rgba(139,92,246,0.18)] rounded-[8px] p-[12px]">
          <Lightbulb className="w-4 h-4 text-[#a78bfa] flex-shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-[12px] text-[#a1a1aa] leading-relaxed">
            Problem Codeforces yang belum kamu sentuh, di rentang rating kamu sendiri,
            diambil dari tag yang paling sering gagal. Semua dihitung dari submission yang
            sudah tersync — tidak ada yang diambil dari Codeforces saat halaman ini dibuka.
          </p>
        </div>

        {options.length > 0 && (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter tag">
            <button
              onClick={() => setTag("")}
              aria-pressed={tag === ""}
              className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] ${
                tag === ""
                  ? "bg-[rgba(139,92,246,0.15)] text-[#a78bfa] border-[rgba(139,92,246,0.35)]"
                  : "bg-[#1f1f23] text-[#a1a1aa] border-[rgba(255,255,255,0.08)] hover:text-[#e4e4e7]"
              }`}
            >
              Tag terlemah
            </button>
            {options.map((t) => (
              <button
                key={t}
                onClick={() => setTag(t)}
                aria-pressed={tag === t}
                className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] ${
                  tag === t
                    ? "bg-[rgba(139,92,246,0.15)] text-[#a78bfa] border-[rgba(139,92,246,0.35)]"
                    : "bg-[#1f1f23] text-[#a1a1aa] border-[rgba(255,255,255,0.08)] hover:text-[#e4e4e7]"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        <RecommendPanel data={data} basis={basis} loading={loading} error={error} />

        <p className="text-[11px] text-[#71717a]">
          Belum ada yang cocok?{" "}
          <Link href="/problems" className="text-[#8b5cf6] hover:underline">
            Buka Problemset
          </Link>{" "}
          dan pilih sendiri — rekomendasi ini hanya melihat problem Codeforces yang sudah
          diimpor.
        </p>
      </div>
    </>
  );
}
