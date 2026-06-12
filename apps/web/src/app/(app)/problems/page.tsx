"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Files } from "lucide-react";
import Link from "next/link";
import Topbar from "@/components/shell/topbar";
import Badge from "@/components/ui/badge";
import Button from "@/components/ui/button";
import EmptyState from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { fetchProblems } from "@/lib/api/problems";
import type { Problem } from "@/lib/api/types";

const PROVIDERS: Array<{ value: string; label: string }> = [
  { value: "", label: "All" },
  { value: "codeforces", label: "Codeforces" },
  { value: "tlx", label: "TLX" },
];

function ProblemsetContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialProvider = searchParams.get("provider") || "";
  const [provider, setProvider] = useState(initialProvider);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setProvider(searchParams.get("provider") || "");
  }, [searchParams]);

  useEffect(() => {
    setLoading(true);
    fetchProblems({ provider: provider || undefined })
      .then((res) => { setProblems(res.data); setTotal(res.total); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [provider]);

  return (
    <>
      <Topbar title="Problemset">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-[8px] top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#52525b]" />
            <input
              className="w-[200px] h-[30px] pl-[28px] pr-[10px] rounded-[6px] text-[12px] bg-[#1f1f23] border border-[rgba(255,255,255,0.08)] text-[#e4e4e7] focus:outline-none focus:border-[#8b5cf6] transition-colors"
              placeholder="Search problems..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </Topbar>

      <div className="flex-1 overflow-y-auto p-[14px]">
        <div className="flex gap-2 mb-3">
          {PROVIDERS.map((p) => (
            <button
              key={p.value}
              onClick={() => { setProvider(p.value); router.push(`/problems${p.value ? `?provider=${p.value}` : ""}`); }}
              className={`px-[10px] py-[4px] rounded-full text-[11px] font-medium transition-colors ${
                provider === p.value ? "bg-[#8b5cf6] text-white" : "bg-[#1f1f23] text-[#71717a] hover:text-[#e4e4e7] border border-[rgba(255,255,255,0.08)]"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {loading ? (
          <TableSkeleton rows={5} cols={5} />
        ) : problems.length === 0 ? (
          <EmptyState
            icon={<Files className="w-8 h-8" />}
            title="No problems synced yet"
            description="Sync problems from Codeforces or TLX using the browser extension."
            action={<Button variant="primary">Install Extension</Button>}
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
                {problems.map((p) => {
                  const tags = (() => { try { return JSON.parse(p.tags) as string[] } catch { return [] } })();
                  return (
                    <tr key={p.id} className="border-b border-[rgba(255,255,255,0.04)] hover:bg-[#1f1f23] transition-colors cursor-pointer">
                      <td className="py-[10px] px-[14px]">
                        <Link href={`/problems/${p.id}`} className="text-[#e4e4e7] hover:text-[#8b5cf6] transition-colors">
                          {p.title}
                        </Link>
                      </td>
                      <td className="py-[10px] px-[14px]">
                        <Badge variant={p.provider === "codeforces" ? "cf" : "difficulty"}>{p.provider}</Badge>
                      </td>
                      <td className="py-[10px] px-[14px] text-[#fbbf24]">{p.difficulty}</td>
                      <td className="py-[10px] px-[14px]">
                        <div className="flex gap-1 flex-wrap">
                          {tags.slice(0, 3).map((t: string) => (
                            <span key={t} className="text-[11px] text-[#71717a]">{t}</span>
                          ))}
                        </div>
                      </td>
                      <td className="py-[10px] px-[14px]">
                        {p.status === "solved" ? <Badge variant="verdict-ac">✓</Badge> : p.status === "synced" ? <Badge variant="cf">↻</Badge> : <Badge variant="verdict-pending">○</Badge>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {total > 0 && (
          <p className="text-[11px] text-[#52525b] mt-2 text-right">{total} problems</p>
        )}
      </div>
    </>
  );
}

export default function ProblemsetPage() {
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center text-[14px] text-[#52525b] animate-pulse">Loading...</div>}>
      <ProblemsetContent />
    </Suspense>
  );
}
