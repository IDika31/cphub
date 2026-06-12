"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import Topbar from "@/components/shell/topbar";
import Badge from "@/components/ui/badge";
import Button from "@/components/ui/button";
import EmptyState from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";

const PROVIDERS = ["All", "Codeforces", "TLX"];
const MOCK_PROBLEMS = [
  { id: "1", title: "A. Watermelon", provider: "Codeforces", diff: 800, tags: ["math", "brute force"], status: "solved" },
  { id: "2", title: "B. Permutation", provider: "TLX", diff: 1200, tags: ["dp", "greedy"], status: "attempted" },
];

export default function ProblemsetPage() {
  const [provider, setProvider] = useState("All");

  return (
    <>
      <Topbar title="Problemset">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-[8px] top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#52525b]" />
            <input
              className="w-[200px] h-[30px] pl-[28px] pr-[10px] rounded-[6px] text-[12px] bg-[#1f1f23] border border-[rgba(255,255,255,0.08)] text-[#e4e4e7] focus:outline-none focus:border-[#8b5cf6] transition-colors"
              placeholder="Search problems..."
            />
          </div>
          <Button variant="default">Filter</Button>
        </div>
      </Topbar>

      <div className="flex-1 overflow-y-auto p-[14px]">
        {/* Filter Pills */}
        <div className="flex gap-2 mb-3">
          {PROVIDERS.map((p) => (
            <button
              key={p}
              onClick={() => setProvider(p)}
              className={`px-[10px] py-[4px] rounded-full text-[11px] font-medium transition-colors ${
                provider === p
                  ? "bg-[#8b5cf6] text-white"
                  : "bg-[#1f1f23] text-[#71717a] hover:text-[#e4e4e7] border border-[rgba(255,255,255,0.08)]"
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Table */}
        {MOCK_PROBLEMS.length === 0 ? (
          <EmptyState
            icon={<Search className="w-8 h-8" />}
            title="No problems found"
            description="Sync problems from Codeforces or TLX using the browser extension."
            action={<Button variant="primary">Sync Problems</Button>}
          />
        ) : (
          <div className="bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-[8px] overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[rgba(255,255,255,0.08)] text-[#71717a] text-[12px]">
                  <th className="text-left py-[10px] px-[14px] font-medium">Problem</th>
                  <th className="text-left py-[10px] px-[14px] font-medium">Provider</th>
                  <th className="text-left py-[10px] px-[14px] font-medium">Difficulty</th>
                  <th className="text-left py-[10px] px-[14px] font-medium">Tags</th>
                  <th className="text-left py-[10px] px-[14px] font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_PROBLEMS.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-[rgba(255,255,255,0.04)] hover:bg-[#1f1f23] transition-colors cursor-pointer"
                  >
                    <td className="py-[10px] px-[14px] text-[#e4e4e7]">{p.title}</td>
                    <td className="py-[10px] px-[14px]">
                      <Badge variant={p.provider === "Codeforces" ? "cf" : "difficulty"}>
                        {p.provider}
                      </Badge>
                    </td>
                    <td className="py-[10px] px-[14px] text-[#fbbf24]">{p.diff}</td>
                    <td className="py-[10px] px-[14px]">
                      <div className="flex gap-1 flex-wrap">
                        {p.tags.map((t) => (
                          <span key={t} className="text-[11px] text-[#71717a]">
                            {t}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-[10px] px-[14px]">
                      {p.status === "solved" ? (
                        <Badge variant="verdict-ac">✓</Badge>
                      ) : (
                        <Badge variant="verdict-pending">○</Badge>
                      )}
                    </td>
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
