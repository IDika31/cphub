"use client";

import { useState, useEffect } from "react";
import Topbar from "@/components/shell/topbar";
import Skeleton from "@/components/ui/skeleton";
import { fetchDashboardOverview, fetchRatingHistory } from "@/lib/api/dashboard";
import type { DashboardOverview } from "@/lib/api/dashboard";
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchDashboardOverview(),
      fetchRatingHistory().catch(() => ({ data: [] })),
    ])
      .then(([overview, ratingRes]) => {
        setData(overview);
        setRatings(ratingRes.data as RatingPoint[]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <Topbar title="Dashboard" />
      <div className="flex-1 overflow-y-auto p-[14px]">
        {/* Overview Cards */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          {[
            { label: "Solved", value: loading ? "..." : String(data?.solved ?? 0) },
            { label: "Streak", value: loading ? "..." : `${data?.streak ?? 0} hari` },
            { label: "Accuracy", value: loading ? "..." : `${Math.round(data?.accuracy ?? 0)}%` },
            { label: "CF Rating", value: loading ? "..." : data?.cfHandle ? String(data.cfRating) : "—" },
          ].map((card) => (
            <div
              key={card.label}
              className="bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-[8px] p-[16px]"
            >
              <div className="text-[12px] text-[#71717a] mb-1">{card.label}</div>
              <div className="text-[24px] font-semibold text-[#e4e4e7]">
                {card.value}
              </div>
              {card.label === "CF Rating" && data?.cfHandle && (
                <div className="text-[11px] text-[#60a5fa] mt-1">{data.cfHandle}</div>
              )}
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
            ) : ratings.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={ratings}>
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
                    labelStyle={{ color: "#71717a" }}
                    formatter={(value: number) => [value, "Rating"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="rating"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#8b5cf6" }}
                    activeDot={{ r: 5, fill: "#8b5cf6" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-[13px] text-[#52525b]">
                {data?.cfHandle
                  ? "No rating history data"
                  : "Hubungkan akun Codeforces untuk melihat rating chart"}
              </div>
            )}
          </div>

          {/* Activity Heatmap */}
          <div className="bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-[8px] p-[16px]">
            <h3 className="text-[13px] font-semibold text-[#e4e4e7] mb-3">
              Activity Heatmap
            </h3>
            {loading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : (
              <div className="h-[200px] flex items-center justify-center text-[13px] text-[#52525b]">
                {data?.cfHandle
                  ? `${data.solved} problems solved · Rating ${data.cfRating}`
                  : "Sync problems untuk melihat activity heatmap"}
              </div>
            )}
          </div>

          {/* Tag Weakness */}
          <div className="col-span-2 bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-[8px] p-[16px]">
            <h3 className="text-[13px] font-semibold text-[#e4e4e7] mb-3">
              Tag Weakness
            </h3>
            {loading ? (
              <Skeleton className="h-[100px] w-full" />
            ) : (
              <div className="h-[100px] flex items-center justify-center text-[13px] text-[#52525b]">
                Sync problems untuk melihat tag weakness analysis
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
