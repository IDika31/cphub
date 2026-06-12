"use client";

import { useState, useEffect } from "react";
import Topbar from "@/components/shell/topbar";
import Skeleton from "@/components/ui/skeleton";
import { fetchDashboardOverview } from "@/lib/api/dashboard";
import type { DashboardOverview } from "@/lib/api/dashboard";

export default function DashboardPage() {
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardOverview()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <Topbar title="Dashboard" />
      <div className="flex-1 overflow-y-auto p-[14px]">
        {/* Overview Cards */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label: "Solved", value: loading ? "..." : String(data?.solved ?? 0) },
            { label: "Streak", value: loading ? "..." : `${data?.streak ?? 0} hari` },
            { label: "Accuracy", value: loading ? "..." : `${data?.accuracy ?? 0}%` },
          ].map((card) => (
            <div
              key={card.label}
              className="bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-[8px] p-[16px]"
            >
              <div className="text-[12px] text-[#71717a] mb-1">{card.label}</div>
              <div className="text-[24px] font-semibold text-[#e4e4e7]">
                {card.value}
              </div>
            </div>
          ))}
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-[8px] p-[16px]">
            <h3 className="text-[13px] font-semibold text-[#e4e4e7] mb-3">
              Rating Progress
            </h3>
            {loading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : (
              <div className="h-[200px] flex items-center justify-center text-[13px] text-[#52525b]">
                Hubungkan akun Codeforces untuk melihat rating chart
              </div>
            )}
          </div>
          <div className="bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-[8px] p-[16px]">
            <h3 className="text-[13px] font-semibold text-[#e4e4e7] mb-3">
              Activity Heatmap
            </h3>
            {loading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : (
              <div className="h-[200px] flex items-center justify-center text-[13px] text-[#52525b]">
                Sync problems untuk melihat activity heatmap
              </div>
            )}
          </div>
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
