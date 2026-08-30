"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Files, X, AlertTriangle } from "lucide-react";
import Link from "next/link";
import Topbar from "@/components/shell/topbar";
import Badge from "@/components/ui/badge";
import Button from "@/components/ui/button";
import EmptyState from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { fetchProblems } from "@/lib/api/problems";
import type { Problem } from "@/lib/api/types";
import ImportTLXModal from "@/components/tlx/ImportTLXModal";
import StatementImport from "@/components/problems/statement-import";
import { providerLabel, providerBadge } from "@/lib/providers";

const PROVIDERS: Array<{ value: string; label: string }> = [
  { value: "", label: "Semua" },
  { value: "codeforces", label: "Codeforces" },
  { value: "tlx", label: "TLX TOKI" },
  { value: "tlx-custom", label: "TLX Custom" },
];

function parseTags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const TD_STATUS = "py-[10px] px-[14px] whitespace-nowrap";

// The API pages at 50 by default. Asking for it explicitly is what makes the
// count line and the prev/next arithmetic below agree with the rows on screen —
// without a page parameter the table showed the first 50 of a ten-thousand-row
// problemset with the full total printed underneath and no way to go further.
const PAGE_SIZE = 50;

function ProblemsetContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialProvider = searchParams.get("provider") || "";
  const [provider, setProvider] = useState(initialProvider);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Bumped by the retry button so the load effect runs again with the same filters.
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState("");
  const [importModalOpen, setImportModalOpen] = useState(false);

  // The page is reset wherever the query itself changes — here, in the provider
  // chip and in the debounce below — rather than in an effect on [provider,
  // debounced]: `page` is a fetch dependency, so an effect would fire a second
  // request for every filter change.
  useEffect(() => {
    setProvider(searchParams.get("provider") || "");
    setPage(1);
  }, [searchParams]);

  // Search is debounced and sent to the server, so it covers the whole table
  // rather than only the rows already loaded. The client-side pass afterwards is
  // just to keep the visible list in sync while a request is in flight.
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const id = setTimeout(() => { setDebounced(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    setLoading(true);
    setError("");
    fetchProblems({ page, limit: PAGE_SIZE, provider: provider || undefined, q: debounced || undefined })
      .then((res) => { setProblems(res.data); setTotal(res.total); })
      .catch((err: unknown) => {
        // A failed request used to be swallowed, so a dead API or an expired token
        // rendered the "nothing synced yet" state — telling a user with ten thousand
        // synced problems to sync them. The server's own message is shown instead.
        setProblems([]);
        setTotal(0);
        setError((err as Error).message || "Gagal memuat problem");
      })
      .finally(() => setLoading(false));
  }, [provider, debounced, page, reloadKey]);

  const query = search.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!query) return problems;
    return problems.filter((p) => {
      const haystack = [p.title, p.problemId, ...parseTags(p.tags)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [problems, query]);

  const offset = (page - 1) * PAGE_SIZE;
  // `total` is the whole filtered count, not this page's size, so it is printed as
  // a range. The range counts problems.length — what the server sent for this page
  // — and not visible.length, which is the client-filtered subset and would make
  // the offset arithmetic lie while the 300 ms debounce catches up. For the same
  // reason a count is only labelled "hasil" once the request for that query landed.
  const countSuffix = query ? ` hasil untuk "${search.trim()}"` : " problem";
  const countLabel =
    query && debounced.toLowerCase() !== query
      ? `${visible.length} tampil`
      : problems.length === 0
        ? `0${countSuffix}`
        : `${offset + 1}–${offset + problems.length} dari ${total}${countSuffix}`;

  return (
    <>
      <Topbar title="Problemset">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-[8px] top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#a1a1aa]" aria-hidden="true" />
            <input
              type="search"
              aria-label="Cari problem"
              className="w-[200px] h-[30px] pl-[28px] pr-[28px] rounded-[6px] text-[12px] bg-[#1f1f23] border border-[rgba(255,255,255,0.08)] text-[#e4e4e7] placeholder-[#a1a1aa] focus:outline-none focus:border-[#8b5cf6] transition-colors"
              placeholder="Cari judul, id, tag..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
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
          {/* Statements, for a filtered slice of what is already synced. The metadata comes
              from the API on a ticker; this is the half the API has no method for. */}
          <StatementImport />
          <Button variant="primary" onClick={() => setImportModalOpen(true)}>
            Import TLX
          </Button>
        </div>
      </Topbar>
      <ImportTLXModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onSuccess={(id) => router.push(`/problems/${id}`)}
      />

      <div className="flex-1 overflow-y-auto p-[14px]">
        <div className="flex gap-2 mb-3">
          {PROVIDERS.map((p) => (
            <button
              key={p.value}
              onClick={() => { setProvider(p.value); setPage(1); router.push(`/problems${p.value ? `?provider=${p.value}` : ""}`); }}
              aria-pressed={provider === p.value}
              className={`px-[10px] py-[4px] rounded-full text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b] ${
                provider === p.value ? "bg-[#7c3aed] text-white" : "bg-[#1f1f23] text-[#a1a1aa] hover:text-[#e4e4e7] border border-[rgba(255,255,255,0.08)]"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {error && (
          <p role="alert" className="text-[12px] text-[#f87171] mb-3">{error}</p>
        )}

        {loading ? (
          <TableSkeleton rows={5} cols={5} />
        ) : error ? (
          <EmptyState
            icon={<AlertTriangle className="w-8 h-8" />}
            title="Gagal memuat problem"
            description="API-nya mungkin sedang tidak jalan, atau sesi kamu sudah kedaluwarsa — coba lagi, dan login ulang kalau tetap gagal."
            action={<Button variant="default" onClick={() => setReloadKey((k) => k + 1)}>Coba lagi</Button>}
          />
        ) : visible.length === 0 && query ? (
          <EmptyState
            icon={<Search className="w-8 h-8" />}
            title={`Tidak ada hasil untuk "${search.trim()}"`}
            description="Coba kata kunci lain, atau hapus filter provider."
            action={<Button variant="default" onClick={() => setSearch("")}>Hapus pencarian</Button>}
          />
        ) : problems.length === 0 ? (
          <EmptyState
            icon={<Files className="w-8 h-8" />}
            title="Belum ada problem tersync"
            description="Sync problem Codeforces lewat extension (Alt+C), atau import problem TLX lewat tombol Import TLX."
            action={<Button variant="primary" onClick={() => setImportModalOpen(true)}>Import TLX</Button>}
          />
        ) : (
          <div className="bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-[8px] overflow-x-auto">
            <table className="w-full text-[13px] min-w-[640px]">
              <thead>
                <tr className="border-b border-[rgba(255,255,255,0.08)] text-[#a1a1aa] text-[12px]">
                  <th scope="col" className="text-left py-[10px] px-[14px] font-medium">Problem</th>
                  <th scope="col" className="text-left py-[10px] px-[14px] font-medium">Provider</th>
                  <th scope="col" className="text-left py-[10px] px-[14px] font-medium">Difficulty</th>
                  <th scope="col" className="text-left py-[10px] px-[14px] font-medium">Tags</th>
                  <th scope="col" className="text-left py-[10px] px-[14px] font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => {
                  const tags = parseTags(p.tags);
                  return (
                    <tr
                      key={p.id}
                      onClick={() => router.push(`/problems/${p.id}`)}
                      className="border-b border-[rgba(255,255,255,0.04)] hover:bg-[#1f1f23] transition-colors cursor-pointer"
                    >
                      <td className="py-[10px] px-[14px]">
                        <Link href={`/problems/${p.id}`} className="text-[#e4e4e7] hover:text-[#a78bfa] transition-colors">
                          {p.title}
                        </Link>
                      </td>
                      <td className="py-[10px] px-[14px]">
                        <Badge variant={providerBadge(p.provider)}>{providerLabel(p.provider)}</Badge>
                      </td>
                      <td className="py-[10px] px-[14px] text-[#fbbf24] tabular-nums">{p.difficulty > 0 ? p.difficulty : <span className="text-[#a1a1aa]">—</span>}</td>
                      <td className="py-[10px] px-[14px]">
                        <div className="flex gap-1 flex-wrap">
                          {tags.slice(0, 3).map((t: string) => (
                            <span key={t} className="text-[11px] text-[#a1a1aa]">{t}</span>
                          ))}
                        </div>
                      </td>
                      <td className={TD_STATUS}>
                        {/* Status is the caller's own outcome, overlaid by the
                            API — it used to be a shared column that read
                            "synced" for everybody. */}
                        {p.status === "solved" ? (
                          <Badge variant="verdict-ac">✓ Solved</Badge>
                        ) : p.status === "attempted" ? (
                          <Badge variant="verdict-tle">◐ Dicoba</Badge>
                        ) : (
                          <Badge variant="verdict-pending">○ Belum</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!loading && !error && (total > 0 || query) && (
          <div className="flex items-center justify-end gap-2 mt-2">
            <p className="text-[11px] text-[#a1a1aa]" aria-live="polite">
              {countLabel}
              {provider ? ` · ${PROVIDERS.find((p) => p.value === provider)?.label ?? provider}` : ""}
            </p>
            {(page > 1 || page * PAGE_SIZE < total) && (
              <div className="flex items-center gap-1">
                <Button variant="default" disabled={page <= 1} onClick={() => setPage((n) => Math.max(1, n - 1))}>
                  Sebelumnya
                </Button>
                <Button variant="default" disabled={page * PAGE_SIZE >= total} onClick={() => setPage((n) => n + 1)}>
                  Berikutnya
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

export default function ProblemsetPage() {
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center text-[14px] text-[#a1a1aa] animate-pulse">Loading...</div>}>
      <ProblemsetContent />
    </Suspense>
  );
}
