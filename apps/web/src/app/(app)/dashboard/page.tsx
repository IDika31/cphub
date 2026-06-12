"use client";

import { useState, useEffect, useCallback } from "react";
import Topbar from "@/components/shell/topbar";
import Badge from "@/components/ui/badge";
import Button from "@/components/ui/button";
import Skeleton from "@/components/ui/skeleton";
import { fetchDashboardOverview, fetchRatingHistory, fetchTagWeakness } from "@/lib/api/dashboard";
import { fetchProblems } from "@/lib/api/problems";
import type { DashboardOverview } from "@/lib/api/dashboard";
import { RefreshCw } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface RatingPoint { contest: string; rating: number; date: number; }
interface TagItem { tag: string; total: number; failed: number; passRate: number; }

export default function DashboardPage() {
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [ratings, setRatings] = useState<RatingPoint[]>([]);
  const [tags, setTags] = useState<TagItem[]>([]);
  const [problemCount, setProblemCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

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
      await fetch("http://localhost:3001/api/dashboard/sync-cf", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("cphub_token")}` },
      });
      await new Promise((r) => setTimeout(r, 2000));
      await loadData();
    } catch {}
    setSyncing(false);
  }

  return (
    <>
      <Topbar title="Dashboard">
        {data?.cfHandle && (
          <div className="flex items-center gap-2">
            <Badge variant="cf">{data.cfHandle}</Badge>
            <Badge variant="difficulty">Rating {data.cfRating}</Badge>
            <Button variant="default" onClick={handleSync} disabled={syncing}>
              <RefreshCw className={`w-3 h-3 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing..." : "Sync CF"}
            </Button>
          </div>
        )}
      </Topbar>

      <div className="flex-1 overflow-y-auto p-[14px]">
        <div className="grid grid-cols-4 gap-3 mb-4">
          {[
            { label: "Problems Solved", value: loading ? "..." : String(data?.solved ?? 0), sub: `${problemCount} synced` },
            { label: "Submissions", value: loading ? "..." : String(data?.attempted ?? 0), sub: "Codeforces" },
            { label: "Success Rate", value: loading ? "..." : `${Math.round(data?.accuracy ?? 0)}%`, sub: "last 200" },
            { label: "CF Rating", value: loading ? "..." : data?.cfHandle ? String(data.cfRating) : "—", sub: data?.cfHandle || "Not connected" },
          ].map((card) => (
            <div key={card.label} className="bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-[8px] p-[16px]">
              <div className="text-[11px] text-[#52525b] mb-1 uppercase tracking-wide">{card.label}</div>
              <div className="text-[28px] font-bold text-[#e4e4e7]">{card.value}</div>
              <div className="text-[11px] text-[#71717a] mt-1">{card.sub}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-[8px] p-[16px]">
            <h3 className="text-[13px] font-semibold text-[#e4e4e7] mb-3">Rating Progress</h3>
            {loading ? <Skeleton className="h-[200px] w-full" /> : ratings.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={ratings.slice(-10)}>
                  <XAxis dataKey="contest" hide /><YAxis domain={["dataMin - 100", "dataMax + 100"]} hide />
                  <Tooltip contentStyle={{ background: "#18181b", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, fontSize: 12, color: "#e4e4e7" }} formatter={(v: number) => [v, "Rating"]} labelFormatter={(i: number) => ratings[i]?.contest || ""} />
                  <Line type="monotone" dataKey="rating" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3, fill: "#8b5cf6" }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : <div className="h-[200px] flex items-center justify-center text-[13px] text-[#52525b]">{data?.cfHandle ? "No contest data" : "Hubungkan Codeforces"}</div>}
          </div>

          <div className="bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-[8px] p-[16px]">
            <h3 className="text-[13px] font-semibold text-[#e4e4e7] mb-3">Stats</h3>
            {loading ? <Skeleton className="h-[200px] w-full" /> : (
              <div className="space-y-3">
                {[["CF Handle", data?.cfHandle || "—"], ["Rating", data?.cfRating ? String(data.cfRating) : "—"], ["Solved", String(data?.solved || 0)], ["Submissions", String(data?.attempted || 0)], ["Streak", `${data?.streak || 0} hari`]].map(([l, v]) => (
                  <div key={l} className="flex justify-between"><span className="text-[13px] text-[#71717a]">{l}</span><span className="text-[13px] font-semibold text-[#e4e4e7]">{v}</span></div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-[8px] p-[16px]">
          <h3 className="text-[13px] font-semibold text-[#e4e4e7] mb-3">Tag Weakness</h3>
          {loading ? <Skeleton className="h-[120px] w-full" /> : tags.length === 0 ? (
            <div className="h-[80px] flex items-center justify-center text-[13px] text-[#52525b]">Hubungkan Codeforces untuk melihat analisis tag</div>
          ) : (
            <div className="space-y-1.5">
              {tags.slice(0, 8).map((t) => (
                <div key={t.tag} className="flex items-center gap-3">
                  <span className="text-[12px] text-[#e4e4e7] w-[120px] truncate">{t.tag}</span>
                  <div className="flex-1 h-[8px] bg-[#1f1f23] rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${t.passRate}%`, background: t.passRate < 40 ? "#ef4444" : t.passRate < 60 ? "#f59e0b" : "#10b981" }} />
                  </div>
                  <span className="text-[11px] text-[#52525b] w-[60px] text-right">{Math.round(t.passRate)}%</span>
                  <span className="text-[11px] text-[#52525b] w-[50px] text-right">{t.failed}/{t.total}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
