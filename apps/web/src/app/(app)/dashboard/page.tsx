"use client";

import { useState, useEffect, useCallback } from "react";
import Topbar from "@/components/shell/topbar";
import Badge from "@/components/ui/badge";
import Button from "@/components/ui/button";
import Skeleton from "@/components/ui/skeleton";
import { fetchDashboardOverview, fetchRatingHistory } from "@/lib/api/dashboard";
import { fetchProblems } from "@/lib/api/problems";
import type { DashboardOverview } from "@/lib/api/dashboard";
import { RefreshCw } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";

interface RatingPoint {
  contest: string;
  rating: number;
  date: number;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [ratings, setRatings] = useState<RatingPoint[]>([]);
  const [problemCount, setProblemCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [overview, ratingRes, problemsRes] = await Promise.all([
      fetchDashboardOverview().catch(() => null),
      fetchRatingHistory().catch(() => ({ data: [] })),
      fetchProblems({ limit: 1 }).catch(() => ({ total: 0 })),
    ]);
    setData(overview);
    setRatings(ratingRes.data as RatingPoint[]);
    setProblemCount(problemsRes.total);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleSync() {
    setSyncing(true);
    // Trigger sync: fetch CF submissions and store locally
    try {
      await fetch("http://localhost:3001/api/dashboard/sync-cf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("cphub_token")}`,
        },
      });
      await new Promise((r) => setTimeout(r, 2000)); // wait for sync
      await loadData();
    } catch {}
    setSyncing(false);
  }

  const recentRatings = ratings.slice(-10);

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
        {/* Overview Cards */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          {[
            { label: "Problems Solved", value: loading ? "..." : String(data?.solved ?? 0), sub: `${problemCount} synced` },
            { label: "Submissions", value: loading ? "..." : String(data?.attempted ?? 0), sub: "Codeforces" },
            { label: "Success Rate", value: loading ? "..." : `${Math.round(data?.accuracy ?? 0)}%`, sub: "last 200 submissions" },
            { label: "CF Rating", value: loading ? "..." : data?.cfHandle ? String(data.cfRating) : "—", sub: data?.cfHandle || "Not connected" },
          ].map((card) => (
            <div key={card.label} className="bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-[8px] p-[16px]">
              <div className="text-[11px] text-[#52525b] mb-1 uppercase tracking-wide">{card.label}</div>
              <div className="text-[28px] font-bold text-[#e4e4e7]">{card.value}</div>
              <div className="text-[11px] text-[#71717a] mt-1">{card.sub}</div>
            </div>
          ))}
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-2 gap-3">
          {/* Rating Progress */}
          <div className="bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-[8px] p-[16px]">
            <h3 className="text-[13px] font-semibold text-[#e4e4e7] mb-3">
              Rating Progress
            </h3>
            {loading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : recentRatings.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={recentRatings}>
                  <XAxis dataKey="contest" hide />
                  <YAxis domain={["dataMin - 100", "dataMax + 100"]} hide />
                  <Tooltip
                    contentStyle={{
                      background: "#18181b",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 8,
                      fontSize: 12,
                      color: "#e4e4e7",
                    }}
                    formatter={(value: number) => [value, "Rating"]}
                    labelFormatter={(i: number) => recentRatings[i]?.contest || ""}
                  />
                  <Line type="monotone" dataKey="rating" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3, fill: "#8b5cf6" }} activeDot={{ r: 5, fill: "#8b5cf6" }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-[13px] text-[#52525b]">
                {data?.cfHandle ? "No contest history" : "Hubungkan Codeforces"}
              </div>
            )}
          </div>

          {/* Recent Activity */}
          <div className="bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-[8px] p-[16px]">
            <h3 className="text-[13px] font-semibold text-[#e4e4e7] mb-3">
              Recent Activity
            </h3>
            {loading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : (
              <div className="h-[200px] flex flex-col justify-center space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-[13px] text-[#71717a]">CF Handle</span>
                  <span className="text-[13px] font-semibold text-[#e4e4e7]">
                    {data?.cfHandle || "—"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[13px] text-[#71717a]">Rating</span>
                  <span className="text-[13px] font-semibold text-[#fbbf24]">
                    {data?.cfRating || "—"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[13px] text-[#71717a]">Problems Solved</span>
                  <span className="text-[13px] font-semibold text-[#10b981]">
                    {data?.solved || 0}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[13px] text-[#71717a]">Submissions</span>
                  <span className="text-[13px] font-semibold text-[#e4e4e7]">
                    {data?.attempted || 0}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[13px] text-[#71717a]">Streak</span>
                  <span className="text-[13px] font-semibold text-[#e4e4e7]">
                    {data?.streak || 0} hari
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
