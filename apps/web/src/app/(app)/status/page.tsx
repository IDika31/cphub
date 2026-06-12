"use client";

import Topbar from "@/components/shell/topbar";
import Button from "@/components/ui/button";

const COMPONENTS = [
  { name: "Database", status: "ok", latency: "2ms" },
  { name: "Cache", status: "ok", latency: "1ms" },
  { name: "Grader (Native — Arch Linux)", status: "ok", latency: "—" },
  { name: "Extension", status: "ok", version: "v4.0.0" },
  { name: "Codeforces", status: "ok", latency: "—" },
  { name: "TLX TOKI", status: "ok", latency: "—" },
];

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
  return (
    <>
      <Topbar title="Status">
        <Button variant="default">Refresh</Button>
      </Topbar>
      <div className="flex-1 overflow-y-auto p-[14px]">
        <div className="max-w-[600px] space-y-4">
          {/* Overall */}
          <div className="bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-[8px] p-[16px] flex items-center gap-3">
            <StatusDot status="ok" />
            <span className="text-[14px] font-semibold text-[#e4e4e7]">
              Overall: OK
            </span>
          </div>

          {/* Component Cards */}
          <div className="grid grid-cols-2 gap-3">
            {COMPONENTS.map((c) => (
              <div
                key={c.name}
                className="bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-[8px] p-[14px]"
              >
                <div className="flex items-center gap-2 mb-1">
                  <StatusDot status={c.status} />
                  <span className="text-[13px] font-semibold text-[#e4e4e7]">{c.name}</span>
                </div>
                <p className="text-[11px] text-[#52525b]">
                  {c.latency && `Latency: ${c.latency}`}
                  {c.version && `Version: ${c.version}`}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
