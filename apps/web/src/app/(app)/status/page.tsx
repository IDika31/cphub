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

/** Only things the /api/health probe actually measures get a status dot. Fixed
 *  facts about the integrations live in a separate list, so a green dot always
 *  means "checked just now" instead of "hardcoded in the page". */
const INTEGRATIONS: Array<{ name: string; detail: string }> = [
  { name: "Extension", detail: "CF auto-sync + TLX web-mediated import · Alt+C buka editor" },
  { name: "Codeforces", detail: "OAuth di Connections + sync lewat extension" },
  { name: "TLX TOKI", detail: "Import & submit lewat token tersimpan (login di Connections)" },
];

function StatusDot({ status }: { status: string }) {
  const label = status === "ok" ? "OK" : status === "degraded" ? "Memeriksa" : "Error";
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`w-2 h-2 rounded-full inline-block flex-shrink-0 ${
        status === "ok" ? "bg-[#10b981]" : status === "degraded" ? "bg-[#f59e0b]" : "bg-[#ef4444]"
      }`}
    />
  );
}

export default function StatusPage() {
  const [overall, setOverall] = useState<string>("checking");
  const [components, setComponents] = useState<ComponentStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadStatus() {
    setLoading(true);
    setError("");
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
          detail: `PostgreSQL · ${dbStatus === "ok" ? "Connected" : "Error"}`,
        },
        {
          name: "Cache",
          status: cacheStatus as ComponentStatus["status"],
          detail: `Redis · ${cacheStatus === "ok" ? "Connected" : "Error"}`,
        },
        {
          name: "Grader (native sandbox)",
          status: graderStatus as ComponentStatus["status"],
          detail: graderStatus === "ok"
            ? "GCC · Python · Node.js · Java terdeteksi"
            : "Grader tidak tersedia — cek compiler & firejail di host",
        },
      ]);
    } catch (err) {
      setOverall("error");
      setComponents([]);
      setError((err as Error).message || "API tidak merespons");
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
        <Button variant="default" onClick={loadStatus} disabled={loading}>
          {loading ? "Memeriksa..." : "Refresh"}
        </Button>
      </Topbar>
      <div className="flex-1 overflow-y-auto p-[14px]">
        <div className="max-w-[600px] space-y-4">
          <div
            className="bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-[8px] p-[16px] flex items-center gap-3"
            aria-live="polite"
          >
            <StatusDot status={loading ? "degraded" : overall === "ok" ? "ok" : "error"} />
            <span className="text-[14px] font-semibold text-[#e4e4e7]">
              Overall: {loading ? "Checking..." : overall === "ok" ? "OK" : "Error"}
            </span>
          </div>

          {error && (
            <p role="alert" className="text-[12px] text-[#f87171]">
              {error}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {loading
              ? Array.from({ length: 3 }).map((_, i) => (
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
                    <p className="text-[11px] text-[#a1a1aa]">{c.detail}</p>
                  </div>
                ))}
          </div>

          <div className="bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-[8px] p-[16px]">
            <h2 className="text-[13px] font-semibold text-[#e4e4e7] mb-1">Integrasi</h2>
            <p className="text-[11px] text-[#a1a1aa] mb-3">
              Konfigurasi, bukan hasil pengecekan langsung — status koneksi akun ada di Connections.
            </p>
            <ul className="divide-y divide-[rgba(255,255,255,0.06)]">
              {INTEGRATIONS.map((i) => (
                <li key={i.name} className="py-[9px] first:pt-0 last:pb-0">
                  <div className="text-[13px] text-[#e4e4e7]">{i.name}</div>
                  <div className="text-[11px] text-[#a1a1aa]">{i.detail}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
