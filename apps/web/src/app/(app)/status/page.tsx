"use client";

import { useState, useEffect } from "react";
import Topbar from "@/components/shell/topbar";
import Button from "@/components/ui/button";
import Skeleton from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api/client";

interface ComponentStatus {
  name: string;
  status: "ok" | "degraded" | "error";
  detail: string;
}

function StatusDot({ status }: { status: string }) {
  return (
    <span
      className={`w-2 h-2 rounded-full inline-block ${
        status === "ok" ? "bg-[#10b981]" : status === "degraded" ? "bg-[#f59e0b]" : "bg-[#ef4444]"
      }`}
    />
  );
}

export default function StatusPage() {
  const [overall, setOverall] = useState<string>("checking");
  const [components, setComponents] = useState<ComponentStatus[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadStatus() {
    setLoading(true);
    try {
      const health: Record<string, unknown> = await apiClient("/api/health");

      const dbStatus = (health.database as { status?: string })?.status || "error";
      const cacheStatus = (health.cache as { status?: string })?.status || "error";
      const graderStatus = (health.grader as { status?: string })?.status || "error";

      setOverall((health.overall as string) || "unknown");

      setComponents([
        {
          name: "Database",
          status: dbStatus as ComponentStatus["status"],
          detail: `PostgreSQL 16 · ${dbStatus === "ok" ? "Connected" : "Error"}`,
        },
        {
          name: "Cache",
          status: cacheStatus as ComponentStatus["status"],
          detail: `Redis 7 · ${cacheStatus === "ok" ? "Connected" : "Error"}`,
        },
        {
          name: "Grader (Native — Arch Linux)",
          status: graderStatus as ComponentStatus["status"],
          detail: graderStatus === "ok"
            ? "GCC 14+ · Python 3.12+ · Node.js 22+ · Java 21+"
            : "Grader not available",
        },
        {
          name: "Extension",
          status: "ok",
          detail: "Browser extension ready · v4.0.0",
        },
        {
          name: "Codeforces",
          status: "ok",
          detail: "Codeforces API · OAuth ready",
        },
        {
          name: "TLX TOKI",
          status: "ok",
          detail: "TLX scraper ready · via extension",
        },
      ]);
    } catch {
      setOverall("error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStatus();
  }, []);

  return (
    <>
      <Topbar title="Status">
        <Button variant="default" onClick={loadStatus}>
          Refresh
        </Button>
      </Topbar>
      <div className="flex-1 overflow-y-auto p-[14px]">
        <div className="max-w-[600px] space-y-4">
          <div className="bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-[8px] p-[16px] flex items-center gap-3">
            <StatusDot status={loading ? "degraded" : overall === "ok" ? "ok" : "error"} />
            <span className="text-[14px] font-semibold text-[#e4e4e7]">
              Overall: {loading ? "Checking..." : overall === "ok" ? "OK" : "Error"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {loading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-[64px]" />
                ))
              : components.map((c) => (
                  <div
                    key={c.name}
                    className="bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-[8px] p-[14px]"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <StatusDot status={c.status} />
                      <span className="text-[13px] font-semibold text-[#e4e4e7]">
                        {c.name}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#52525b]">{c.detail}</p>
                  </div>
                ))}
          </div>
        </div>
      </div>
    </>
  );
}
