"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import Topbar from "@/components/shell/topbar";
import Badge, { VerdictBadge } from "@/components/ui/badge";
import EmptyState from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import {
  fetchExternalSubmissions, fetchLocalSubmissions,
  type ExternalSubmission, type LocalSubmission,
} from "@/lib/api/submissions";

type Tab = "local" | "external";

function providerLabel(p: string) {
  return p === "codeforces" ? "Codeforces" : p === "tlx" ? "TLX TOKI" : p;
}

export default function SubmissionsPage() {
  const [tab, setTab] = useState<Tab>("local");
  const [local, setLocal] = useState<LocalSubmission[]>([]);
  const [external, setExternal] = useState<ExternalSubmission[]>([]);
  const [localTotal, setLocalTotal] = useState(0);
  const [externalTotal, setExternalTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const fetcher =
      tab === "local"
        ? fetchLocalSubmissions().then((res) => { setLocal(res.data); setLocalTotal(res.total); })
        : fetchExternalSubmissions().then((res) => { setExternal(res.data); setExternalTotal(res.total); });
    fetcher.catch(() => {}).finally(() => setLoading(false));
  }, [tab]);

  const total = tab === "local" ? localTotal : externalTotal;

  return (
    <>
      <Topbar title="Submission" />
      <div className="flex-1 overflow-y-auto p-[14px]">
        <div className="flex gap-2 mb-3" role="tablist">
          {([
            ["local", "CPHub Runs"],
            ["external", "External (CF + TLX)"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`px-[10px] py-[4px] rounded-full text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b] ${
                tab === key ? "bg-[#8b5cf6] text-white" : "bg-[#1f1f23] text-[#a1a1aa] hover:text-[#e4e4e7] border border-[rgba(255,255,255,0.08)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <TableSkeleton rows={5} cols={6} />
        ) : tab === "local" ? (
          local.length === 0 ? (
            <EmptyState
              icon={<ClipboardList className="w-8 h-8" />}
              title="Belum ada run"
              description="Jalankan kode di editor problem (Codeforces atau TLX) — setiap run tersimpan di sini."
            />
          ) : (
            <div className="bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-[8px] overflow-x-auto">
              <table className="w-full text-[13px] min-w-[640px]">
                <thead>
                  <tr className="border-b border-[rgba(255,255,255,0.08)] text-[#71717a] text-[12px]">
                    <th scope="col" className="text-left py-[10px] px-[14px] font-medium">Problem</th>
                    <th scope="col" className="text-left py-[10px] px-[14px] font-medium">Verdict</th>
                    <th scope="col" className="text-left py-[10px] px-[14px] font-medium">Language</th>
                    <th scope="col" className="text-left py-[10px] px-[14px] font-medium">Provider</th>
                    <th scope="col" className="text-left py-[10px] px-[14px] font-medium">Tests</th>
                    <th scope="col" className="text-left py-[10px] px-[14px] font-medium">Runtime</th>
                  </tr>
                </thead>
                <tbody>
                  {local.map((s) => (
                    <tr key={s.id} className="border-b border-[rgba(255,255,255,0.04)] hover:bg-[#1f1f23] transition-colors">
                      <td className="py-[10px] px-[14px]">
                        <Link href={`/problems/${s.problemId}`} className="text-[#e4e4e7] hover:text-[#8b5cf6] transition-colors">
                          {s.problemTitle || s.problemRef}
                        </Link>
                      </td>
                      <td className="py-[10px] px-[14px]"><VerdictBadge verdict={s.verdict} /></td>
                      <td className="py-[10px] px-[14px] text-[#71717a]">{s.language}</td>
                      <td className="py-[10px] px-[14px]">
                        <Badge variant={s.provider === "codeforces" ? "cf" : "difficulty"}>{providerLabel(s.provider)}</Badge>
                      </td>
                      <td className="py-[10px] px-[14px] text-[#71717a] tabular-nums">{s.passedTests}/{s.totalTests}</td>
                      <td className="py-[10px] px-[14px] text-[#71717a]">{s.runtime}ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : external.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="w-8 h-8" />}
            title="No external submissions"
            description="Sync submission Codeforces lewat tombol Sync CF di Dashboard."
          />
        ) : (
          <div className="bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-[8px] overflow-x-auto">
            <table className="w-full text-[13px] min-w-[640px]">
              <thead>
                <tr className="border-b border-[rgba(255,255,255,0.08)] text-[#71717a] text-[12px]">
                  <th scope="col" className="text-left py-[10px] px-[14px] font-medium">Problem</th>
                  <th scope="col" className="text-left py-[10px] px-[14px] font-medium">Verdict</th>
                  <th scope="col" className="text-left py-[10px] px-[14px] font-medium">Language</th>
                  <th scope="col" className="text-left py-[10px] px-[14px] font-medium">OJ</th>
                  <th scope="col" className="text-left py-[10px] px-[14px] font-medium">Runtime</th>
                  <th scope="col" className="text-left py-[10px] px-[14px] font-medium">Memory</th>
                  <th scope="col" className="text-left py-[10px] px-[14px] font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {external.map((s) => (
                  <tr key={s.id} className="border-b border-[rgba(255,255,255,0.04)] hover:bg-[#1f1f23] transition-colors">
                    <td className="py-[10px] px-[14px] text-[#e4e4e7]">{s.problemTitle}</td>
                    <td className="py-[10px] px-[14px]"><VerdictBadge verdict={s.verdict} /></td>
                    <td className="py-[10px] px-[14px] text-[#71717a]">{s.language}</td>
                    <td className="py-[10px] px-[14px]">
                      <Badge variant={s.provider === "codeforces" ? "cf" : "difficulty"}>{providerLabel(s.provider)}</Badge>
                    </td>
                    <td className="py-[10px] px-[14px] text-[#71717a]">{s.runtime ? `${s.runtime}ms` : "—"}</td>
                    <td className="py-[10px] px-[14px] text-[#71717a]">{s.memory ? `${s.memory}KB` : "—"}</td>
                    <td className="py-[10px] px-[14px] text-[#71717a] text-[11px]">{s.submittedAt ? new Date(s.submittedAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {total > 0 && <p className="text-[11px] text-[#52525b] mt-2 text-right">{total} submissions</p>}
      </div>
    </>
  );
}
