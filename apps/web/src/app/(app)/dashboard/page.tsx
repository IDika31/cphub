"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Topbar from "@/components/shell/topbar";
import Badge from "@/components/ui/badge";
import Button from "@/components/ui/button";
import Skeleton from "@/components/ui/skeleton";
import { fetchDashboardOverview, fetchRatingHistory, fetchTagWeakness, syncCFSubmissions, syncTLXSubmissions } from "@/lib/api/dashboard";
import { fetchProblems } from "@/lib/api/problems";
import type { DashboardOverview } from "@/lib/api/dashboard";
import {
  RefreshCw, CheckCircle2, Send, Target, Trophy, Flame, Link2,
  TrendingUp, TrendingDown, ArrowRight,
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface RatingPoint { contest: string; rating: number; date: number; }
interface TagItem { tag: string; total: number; failed: number; passRate: number; }

export default function DashboardPage() {
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [ratings, setRatings] = useState<RatingPoint[]>([]);
  const [tags, setTags] = useState<TagItem[]>([]);
  const [problemCount, setProblemCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncingTLX, setSyncingTLX] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [overview, ratingRes, problemsRes, tagRes] = await Promise.all([
      fetchDashboardOverview().catch(() => null),
      fetchRatingHistory().catch(() => ({ data: [] })),
      fetchProblems({ limit: 1 }).catch(() => ({ total: 0 })),
      fetchTagWeakness().catch(() => ({ data: [] })),
    ]);
    setData(overview);
    setRatings(ratingRes.data as RatingPoint[]);
    setTags(tagRes.data as TagItem[]);
    setProblemCount(problemsRes.total);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleSync() {
    setSyncing(true);
    try {
      await syncCFSubmissions();
      await loadData();
    } catch {}
    setSyncing(false);
  }

  async function handleSyncTLX() {
    setSyncingTLX(true);
    try {
      await syncTLXSubmissions();
      await loadData();
    } catch {}
    setSyncingTLX(false);
  }

  const connected = !!data?.cfHandle;
  const shownRatings = ratings.slice(-12);
  const ratingDelta =
    shownRatings.length >= 2
      ? shownRatings[shownRatings.length - 1].rating - shownRatings[0].rating
      : 0;
  const sortedTags = [...tags].sort((a, b) => a.passRate - b.passRate).slice(0, 8);

  const cards = [
    { label: "Problems Solved", value: String(data?.solved ?? 0), sub: `${problemCount} synced`, icon: CheckCircle2, color: "#34d399" },
    { label: "Submissions", value: String(data?.attempted ?? 0), sub: "Codeforces", icon: Send, color: "#60a5fa" },
    { label: "Success Rate", value: `${Math.round(data?.accuracy ?? 0)}%`, sub: "last 200", icon: Target, color: "#fbbf24" },
    { label: "CF Rating", value: connected ? String(data!.cfRating) : "—", sub: data?.cfHandle || "Not connected", icon: Trophy, color: "#8b5cf6" },
  ];

  return (
    <>
      <Topbar title="Dashboard">
        <div className="flex items-center gap-2">
          {connected && (
            <>
              <Badge variant="cf">{data!.cfHandle}</Badge>
              <Badge variant="difficulty">Rating {data!.cfRating}</Badge>
            </>
          )}
          <Button
            variant="default"
            onClick={handleSync}
            disabled={syncing || !connected}
            title={connected ? "Sync data Codeforces" : "Hubungkan Codeforces dulu"}
          >
            <RefreshCw className={`w-3 h-3 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing..." : "Sync CF"}
          </Button>
          <Button
            variant="default"
            onClick={handleSyncTLX}
            disabled={syncingTLX}
            title="Sync submission history TLX"
          >
            <RefreshCw className={`w-3 h-3 ${syncingTLX ? "animate-spin" : ""}`} />
            {syncingTLX ? "Syncing..." : "Sync TLX"}
          </Button>
        </div>
      </Topbar>

      <div className="flex-1 overflow-y-auto p-[14px]">
        {/* Not-connected CTA */}
        {!loading && !connected && (
          <Link
            href="/connections"
            className="group flex items-center gap-3 mb-4 bg-[rgba(139,92,246,0.08)] border border-[rgba(139,92,246,0.25)] rounded-[8px] p-[14px] hover:bg-[rgba(139,92,246,0.12)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]"
          >
            <div className="w-9 h-9 rounded-[8px] bg-[rgba(139,92,246,0.15)] text-[#8b5cf6] flex items-center justify-center flex-shrink-0">
              <Link2 className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold text-[#e4e4e7]">Hubungkan Codeforces</div>
              <div className="text-[12px] text-[#a1a1aa]">Sambungkan akun untuk melihat rating, statistik, dan analisis tag.</div>
            </div>
            <ArrowRight className="w-4 h-4 text-[#8b5cf6] group-hover:translate-x-0.5 transition-transform" />
          </Link>
        )}

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {cards.map((card) => (
            <div
              key={card.label}
              className="bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-[8px] p-[16px] hover:border-[rgba(255,255,255,0.16)] transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="text-[11px] text-[#71717a] uppercase tracking-wide">{card.label}</div>
                <div
                  className="w-6 h-6 rounded-[6px] flex items-center justify-center flex-shrink-0"
                  style={{ background: `${card.color}26`, color: card.color }}
                >
                  <card.icon className="w-3.5 h-3.5" />
                </div>
              </div>
              {loading ? (
                <Skeleton className="h-[34px] w-[60px] my-[1px]" />
              ) : (
                <div className="text-[28px] font-bold text-[#e4e4e7] leading-tight">{card.value}</div>
              )}
              <div className="text-[11px] text-[#71717a] mt-1 truncate">{card.sub}</div>
            </div>
          ))}
        </div>

        {/* Per-provider breakdown */}
        <div className="bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-[8px] p-[16px] mb-4">
          <h3 className="text-[13px] font-semibold text-[#e4e4e7] mb-3">Problem per Provider</h3>
          {loading ? (
            <Skeleton className="h-[60px] w-full" />
          ) : !data?.byProvider?.length ? (
            <p className="text-[13px] text-[#71717a]">Belum ada problem tersync. Sync Codeforces atau import TLX.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {data.byProvider.map((p) => (
                <div key={p.provider} className="flex items-center gap-3 bg-[#1f1f23] border border-[rgba(255,255,255,0.06)] rounded-[6px] p-[12px]">
                  <Badge variant={p.provider === "codeforces" ? "cf" : "difficulty"}>
                    {p.provider === "codeforces" ? "Codeforces" : p.provider === "tlx" ? "TLX TOKI" : p.provider}
                  </Badge>
                  <div className="flex-1 flex items-center justify-end gap-4 text-right">
                    <div>
                      <div className="text-[16px] font-bold text-[#e4e4e7] leading-none">{p.problems}</div>
                      <div className="text-[10px] text-[#71717a] uppercase tracking-wide mt-0.5">problem</div>
                    </div>
                    <div>
                      <div className="text-[16px] font-bold text-[#34d399] leading-none">{p.solved}</div>
                      <div className="text-[10px] text-[#71717a] uppercase tracking-wide mt-0.5">solved</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
          <div className="bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-[8px] p-[16px]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[13px] font-semibold text-[#e4e4e7]">Rating Progress</h3>
              {!loading && shownRatings.length >= 2 && (
                <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${ratingDelta >= 0 ? "text-[#34d399]" : "text-[#ef4444]"}`}>
                  {ratingDelta >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {ratingDelta >= 0 ? "+" : ""}{ratingDelta}
                </span>
              )}
            </div>
            {loading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : shownRatings.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={shownRatings} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                  <defs>
                    <linearGradient id="ratingFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="contest" hide />
                  <YAxis domain={["dataMin - 100", "dataMax + 100"]} hide />
                  <Tooltip
                    contentStyle={{ background: "#0f0f10", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, fontSize: 12, color: "#e4e4e7" }}
                    formatter={(v: number) => [v, "Rating"]}
                    labelFormatter={(i: number) => shownRatings[i]?.contest || ""}
                  />
                  <Area type="monotone" dataKey="rating" stroke="#8b5cf6" strokeWidth={2} fill="url(#ratingFill)" dot={{ r: 2.5, fill: "#8b5cf6" }} activeDot={{ r: 5 }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex flex-col items-center justify-center gap-1 text-center">
                <p className="text-[13px] text-[#71717a]">{connected ? "Belum ada data kontes" : "Hubungkan Codeforces"}</p>
                {!connected && <Link href="/connections" className="text-[12px] text-[#8b5cf6] hover:underline">Ke Connections →</Link>}
              </div>
            )}
          </div>

          <div className="bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-[8px] p-[16px]">
            <h3 className="text-[13px] font-semibold text-[#e4e4e7] mb-3">Stats</h3>
            {loading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : (
              <div className="divide-y divide-[rgba(255,255,255,0.06)]">
                {([
                  ["CF Handle", data?.cfHandle || "—", Trophy],
                  ["Rating", data?.cfRating ? String(data.cfRating) : "—", TrendingUp],
                  ["Solved", String(data?.solved || 0), CheckCircle2],
                  ["Submissions", String(data?.attempted || 0), Send],
                  ["Streak", `${data?.streak || 0} hari`, Flame],
                ] as const).map(([l, v, Icon]) => (
                  <div key={l} className="flex items-center justify-between py-[9px]">
                    <span className="flex items-center gap-2 text-[13px] text-[#a1a1aa]">
                      <Icon className="w-3.5 h-3.5 text-[#71717a]" />
                      {l}
                    </span>
                    <span className="text-[13px] font-semibold text-[#e4e4e7]">{v}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Tag weakness */}
        <div className="bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-[8px] p-[16px]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[13px] font-semibold text-[#e4e4e7]">Tag Weakness</h3>
            {!loading && sortedTags.length > 0 && (
              <div className="flex items-center gap-3 text-[10px] text-[#71717a]">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#ef4444]" /> &lt;40%</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#f59e0b]" /> &lt;60%</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#10b981]" /> ≥60%</span>
              </div>
            )}
          </div>
          {loading ? (
            <Skeleton className="h-[120px] w-full" />
          ) : sortedTags.length === 0 ? (
            <div className="h-[80px] flex flex-col items-center justify-center gap-1 text-center">
              <p className="text-[13px] text-[#71717a]">Belum ada analisis tag</p>
              {!connected && <Link href="/connections" className="text-[12px] text-[#8b5cf6] hover:underline">Hubungkan Codeforces →</Link>}
            </div>
          ) : (
            <div className="space-y-2">
              {sortedTags.map((t) => {
                const color = t.passRate < 40 ? "#ef4444" : t.passRate < 60 ? "#f59e0b" : "#10b981";
                return (
                  <div key={t.tag} className="flex items-center gap-3">
                    <span className="text-[12px] text-[#e4e4e7] w-[110px] truncate" title={t.tag}>{t.tag}</span>
                    <div className="flex-1 h-[8px] bg-[#1f1f23] rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${t.passRate}%`, background: color }} />
                    </div>
                    <span className="text-[11px] font-medium w-[42px] text-right" style={{ color }}>{Math.round(t.passRate)}%</span>
                    <span className="text-[11px] text-[#71717a] w-[48px] text-right tabular-nums">{t.failed}/{t.total}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
