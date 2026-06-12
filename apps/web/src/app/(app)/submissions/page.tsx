"use client";

import Topbar from "@/components/shell/topbar";
import Badge, { VerdictBadge } from "@/components/ui/badge";
import EmptyState from "@/components/ui/empty-state";
import { ClipboardList } from "lucide-react";

const MOCK_SUBMISSIONS = [
  { id: "1", problem: "A. Watermelon", verdict: "AC", lang: "C++17", provider: "CF", runtime: 12, memory: 4 },
  { id: "2", problem: "B. Array", verdict: "WA", lang: "Python3", provider: "TLX", runtime: 0, memory: 0 },
];

export default function SubmissionsPage() {
  return (
    <>
      <Topbar title="Submission" />
      <div className="flex-1 overflow-y-auto p-[14px]">
        {MOCK_SUBMISSIONS.length === 0 ? (
          <EmptyState icon={<ClipboardList className="w-8 h-8" />} title="No submissions" />
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
                {MOCK_SUBMISSIONS.map((s) => (
                  <tr key={s.id} className="border-b border-[rgba(255,255,255,0.04)] hover:bg-[#1f1f23] transition-colors">
                    <td className="py-[10px] px-[14px] text-[#e4e4e7]">{s.problem}</td>
                    <td className="py-[10px] px-[14px]"><VerdictBadge verdict={s.verdict} /></td>
                    <td className="py-[10px] px-[14px] text-[#71717a]">{s.lang}</td>
                    <td className="py-[10px] px-[14px]"><Badge variant={s.provider === "CF" ? "cf" : "difficulty"}>{s.provider}</Badge></td>
                    <td className="py-[10px] px-[14px] text-[#71717a]">{s.runtime}ms</td>
                    <td className="py-[10px] px-[14px] text-[#71717a]">{s.memory}MB</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
