"use client";

import { useState, useEffect } from "react";
import { ClipboardList } from "lucide-react";
import Topbar from "@/components/shell/topbar";
import Badge, { VerdictBadge } from "@/components/ui/badge";
import EmptyState from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { fetchExternalSubmissions, type ExternalSubmission } from "@/lib/api/submissions";

export default function SubmissionsPage() {
  const [submissions, setSubmissions] = useState<ExternalSubmission[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchExternalSubmissions()
      .then((res) => { setSubmissions(res.data); setTotal(res.total); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <Topbar title="Submission" />
      <div className="flex-1 overflow-y-auto p-[14px]">
        {loading ? (
          <TableSkeleton rows={5} cols={6} />
        ) : submissions.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="w-8 h-8" />}
            title="No submissions yet"
            description="Sync submissions from Codeforces or TLX using the browser extension."
          />
        ) : (
          <div className="bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-[8px] overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[rgba(255,255,255,0.08)] text-[#71717a] text-[12px]">
                  <th className="text-left py-[10px] px-[14px] font-medium">Problem</th>
                  <th className="text-left py-[10px] px-[14px] font-medium">Verdict</th>
                  <th className="text-left py-[10px] px-[14px] font-medium">Language</th>
                  <th className="text-left py-[10px] px-[14px] font-medium">OJ</th>
                  <th className="text-left py-[10px] px-[14px] font-medium">Runtime</th>
                  <th className="text-left py-[10px] px-[14px] font-medium">Memory</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((s) => (
                  <tr key={s.id} className="border-b border-[rgba(255,255,255,0.04)] hover:bg-[#1f1f23] transition-colors">
                    <td className="py-[10px] px-[14px] text-[#e4e4e7]">{s.problemTitle}</td>
                    <td className="py-[10px] px-[14px]"><VerdictBadge verdict={s.verdict} /></td>
                    <td className="py-[10px] px-[14px] text-[#71717a]">{s.language}</td>
                    <td className="py-[10px] px-[14px]">
                      <Badge variant={s.provider === "codeforces" ? "cf" : "difficulty"}>{s.provider}</Badge>
                    </td>
                    <td className="py-[10px] px-[14px] text-[#71717a]">{s.runtime}ms</td>
                    <td className="py-[10px] px-[14px] text-[#71717a]">{s.memory}KB</td>
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
