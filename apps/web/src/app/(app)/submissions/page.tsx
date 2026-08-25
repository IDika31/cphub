"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ClipboardList, Search, X } from "lucide-react";
import Topbar from "@/components/shell/topbar";
import Badge, { VerdictBadge } from "@/components/ui/badge";
import Button from "@/components/ui/button";
import EmptyState from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { providerLabel, providerBadge } from "@/lib/providers";
import {
  fetchExternalSubmissions, fetchLocalSubmissions,
  type ExternalSubmission, type LocalSubmission,
} from "@/lib/api/submissions";

type Tab = "local" | "external";

const PROVIDERS = [
  { value: "", label: "Semua" },
  { value: "codeforces", label: "Codeforces" },
  { value: "tlx", label: "TLX TOKI" },
  { value: "tlx-custom", label: "TLX custom" },
];



function formatWhen(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("id-ID", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const TH = "text-left py-[10px] px-[14px] font-medium";
const TD = "py-[10px] px-[14px]";

function SubmissionsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // The sidebar links to /submissions?provider=codeforces. This page used to
  // ignore the parameter completely, so those submenu entries did nothing.
  const provider = searchParams.get("provider") || "";
  const [tab, setTab] = useState<Tab>("local");
  const [local, setLocal] = useState<LocalSubmission[]>([]);
  const [external, setExternal] = useState<ExternalSubmission[]>([]);
  const [localTotal, setLocalTotal] = useState(0);
  const [externalTotal, setExternalTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    const load =
      tab === "local"
        ? fetchLocalSubmissions({ provider: provider || undefined }).then((res) => {
            setLocal(res.data);
            setLocalTotal(res.total);
          })
        : fetchExternalSubmissions({ provider: provider || undefined }).then((res) => {
            setExternal(res.data);
            setExternalTotal(res.total);
          });
    load
      .catch((err: unknown) => setError((err as Error).message || "Gagal memuat submission"))
      .finally(() => setLoading(false));
  }, [tab, provider]);

  const query = search.trim().toLowerCase();
  const visibleLocal = useMemo(
    () => (query ? local.filter((s) => matches(query, s.problemTitle, s.problemRef, s.language, s.verdict)) : local),
    [local, query],
  );
  const visibleExternal = useMemo(
    () => (query ? external.filter((s) => matches(query, s.problemTitle, s.problemRef, s.problemGroup, s.language, s.verdict)) : external),
    [external, query],
  );

  const total = tab === "local" ? localTotal : externalTotal;
  const shown = tab === "local" ? visibleLocal.length : visibleExternal.length;
  const loaded = tab === "local" ? local.length : external.length;

  function setProvider(next: string) {
    router.push(`/submissions${next ? `?provider=${next}` : ""}`);
  }

  return (
    <>
      <Topbar title="Submission">
        <div className="relative">
          <Search className="absolute left-[8px] top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#a1a1aa]" aria-hidden="true" />
          <input
            type="search"
            aria-label="Cari submission"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari problem, bahasa, verdict..."
            className="w-[220px] h-[30px] pl-[28px] pr-[28px] rounded-[6px] text-[12px] bg-[#1f1f23] border border-[rgba(255,255,255,0.08)] text-[#e4e4e7] placeholder-[#a1a1aa] focus:outline-none focus:border-[#8b5cf6] transition-colors"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Hapus pencarian"
              className="absolute right-[6px] top-1/2 -translate-y-1/2 p-[2px] rounded text-[#a1a1aa] hover:text-[#e4e4e7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </Topbar>

      <div className="flex-1 overflow-y-auto p-[14px]">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <div className="flex gap-2" role="tablist" aria-label="Sumber submission">
            {([
              ["local", "CPHub Runs"],
              ["external", "External (CF + TLX)"],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                role="tab"
                id={`submissions-tab-${key}`}
                aria-selected={tab === key}
                aria-controls="submissions-panel"
                onClick={() => setTab(key)}
                className={`px-[10px] py-[4px] rounded-full text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b] ${
                  tab === key ? "bg-[#7c3aed] text-white" : "bg-[#1f1f23] text-[#a1a1aa] hover:text-[#e4e4e7] border border-[rgba(255,255,255,0.08)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="w-px h-4 bg-[rgba(255,255,255,0.12)] hidden sm:block" />

          <div className="flex gap-2">
            {PROVIDERS.map((p) => (
              <button
                key={p.value}
                onClick={() => setProvider(p.value)}
                aria-pressed={provider === p.value}
                className={`px-[10px] py-[4px] rounded-full text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b] ${
                  provider === p.value ? "bg-[rgba(139,92,246,0.18)] text-[#a78bfa] border border-[rgba(139,92,246,0.35)]" : "bg-[#1f1f23] text-[#a1a1aa] hover:text-[#e4e4e7] border border-[rgba(255,255,255,0.08)]"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p role="alert" className="text-[12px] text-[#f87171] mb-3">{error}</p>
        )}

        <div id="submissions-panel" role="tabpanel" aria-labelledby={`submissions-tab-${tab}`}>
          {loading ? (
            <TableSkeleton rows={6} cols={6} />
          ) : loaded === 0 ? (
            <EmptyState
              icon={<ClipboardList className="w-8 h-8" />}
              title={tab === "local" ? "Belum ada run" : "Belum ada submission external"}
              description={
                tab === "local"
                  ? "Jalankan kode di editor problem — setiap run tersimpan di sini."
                  : "Klik Sync CF / Sync TLX di Dashboard, atau submit lewat extension."
              }
            />
          ) : shown === 0 ? (
            <EmptyState
              icon={<Search className="w-8 h-8" />}
              title={`Tidak ada hasil untuk "${search.trim()}"`}
              action={<Button variant="default" onClick={() => setSearch("")}>Hapus pencarian</Button>}
            />
          ) : tab === "local" ? (
            <LocalTable rows={visibleLocal} />
          ) : (
            <ExternalTable rows={visibleExternal} />
          )}
        </div>

        {!loading && total > 0 && (
          <p className="text-[11px] text-[#a1a1aa] mt-2 text-right" aria-live="polite">
            {query ? `${shown} dari ${loaded} tampil · ${total} total` : `${total} submission`}
            {provider ? ` · ${providerLabel(provider)}` : ""}
          </p>
        )}
      </div>
    </>
  );
}

function matches(query: string, ...parts: Array<string | undefined>) {
  return parts.filter(Boolean).join(" ").toLowerCase().includes(query);
}

function LocalTable({ rows }: { rows: LocalSubmission[] }) {
  return (
    <div className="bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-[8px] overflow-x-auto">
      <table className="w-full text-[13px] min-w-[720px]">
        <thead>
          <tr className="border-b border-[rgba(255,255,255,0.08)] text-[#a1a1aa] text-[12px]">
            <th scope="col" className={TH}>Problem</th>
            <th scope="col" className={TH}>Verdict</th>
            <th scope="col" className={TH}>Tests</th>
            <th scope="col" className={TH}>Language</th>
            <th scope="col" className={TH}>Provider</th>
            <th scope="col" className={TH}>Runtime</th>
            <th scope="col" className={TH}>Waktu</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id} className="border-b border-[rgba(255,255,255,0.04)] hover:bg-[#1f1f23] transition-colors">
              <td className={TD}>
                {s.problemId ? (
                  <Link href={`/problems/${s.problemId}`} className="text-[#e4e4e7] hover:text-[#a78bfa] transition-colors">
                    {s.problemTitle || s.problemRef || "(tanpa judul)"}
                  </Link>
                ) : (
                  <span className="text-[#e4e4e7]">{s.problemTitle || s.problemRef || "(tanpa judul)"}</span>
                )}
              </td>
              <td className={TD}><VerdictBadge verdict={s.verdict} /></td>
              <td className={`${TD} text-[#a1a1aa] tabular-nums`}>
                {s.totalTests > 0 ? `${s.passedTests}/${s.totalTests}` : "—"}
              </td>
              <td className={`${TD} text-[#a1a1aa]`}>{s.language}</td>
              <td className={TD}>
                <Badge variant={providerBadge(s.provider)}>{providerLabel(s.provider)}</Badge>
              </td>
              <td className={`${TD} text-[#a1a1aa] tabular-nums`}>{s.runtime}ms</td>
              <td className={`${TD} text-[#a1a1aa] text-[11px] whitespace-nowrap`}>{formatWhen(s.executedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExternalTable({ rows }: { rows: ExternalSubmission[] }) {
  // Score only means something on subtask judges, so the column is dropped
  // entirely when nothing in view is partially scored.
  const hasScore = rows.some((s) => s.score > 0);
  return (
    <div className="bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-[8px] overflow-x-auto">
      <table className="w-full text-[13px] min-w-[760px]">
        <thead>
          <tr className="border-b border-[rgba(255,255,255,0.08)] text-[#a1a1aa] text-[12px]">
            <th scope="col" className={TH}>Problem</th>
            <th scope="col" className={TH}>Verdict</th>
            {hasScore && <th scope="col" className={TH}>Score</th>}
            <th scope="col" className={TH}>Language</th>
            <th scope="col" className={TH}>OJ</th>
            <th scope="col" className={TH}>Runtime</th>
            <th scope="col" className={TH}>Memory</th>
            <th scope="col" className={TH}>Waktu</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id} className="border-b border-[rgba(255,255,255,0.04)] hover:bg-[#1f1f23] transition-colors">
              <td className={TD}>
                {/* problemId is filled in once the submission is matched to the
                    local library, which is what makes this deep-link possible. */}
                {s.problemId ? (
                  <Link href={`/problems/${s.problemId}`} className="text-[#e4e4e7] hover:text-[#a78bfa] transition-colors">
                    {s.problemTitle || s.problemRef}
                  </Link>
                ) : (
                  <span className="text-[#e4e4e7]">{s.problemTitle || s.problemRef}</span>
                )}
                {s.problemGroup && (
                  <span className="block text-[11px] text-[#a1a1aa] truncate max-w-[280px]">{s.problemGroup}</span>
                )}
              </td>
              <td className={TD}><VerdictBadge verdict={s.verdict} /></td>
              {hasScore && (
                <td className={`${TD} tabular-nums ${s.score >= 100 ? "text-[#34d399]" : s.score > 0 ? "text-[#fbbf24]" : "text-[#a1a1aa]"}`}>
                  {s.score > 0 ? s.score : "—"}
                </td>
              )}
              <td className={`${TD} text-[#a1a1aa]`}>{s.language || "—"}</td>
              <td className={TD}>
                <Badge variant={providerBadge(s.provider)}>{providerLabel(s.provider)}</Badge>
              </td>
              <td className={`${TD} text-[#a1a1aa] tabular-nums`}>{s.runtime ? `${s.runtime}ms` : "—"}</td>
              <td className={`${TD} text-[#a1a1aa] tabular-nums`}>{s.memory ? `${s.memory}KB` : "—"}</td>
              <td className={`${TD} text-[#a1a1aa] text-[11px] whitespace-nowrap`}>{formatWhen(s.submittedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SubmissionsPage() {
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center text-[13px] text-[#a1a1aa]">Loading...</div>}>
      <SubmissionsContent />
    </Suspense>
  );
}
