"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Loader2, X } from "lucide-react";
import Button from "@/components/ui/button";
import { fetchMissingStatements, type PendingStatement } from "@/lib/api/codeforces";
import {
  fetchStatementsBatchViaExtension,
  hasExtension,
  ExtensionMissingError,
} from "@/lib/extension-bridge";

/** Problems per round trip to the extension. Each one is a real Codeforces page load with a
 *  pause after it, so five is about twenty seconds of work — short enough that Stop feels
 *  immediate and the count keeps moving. */
const BATCH = 5;

interface Progress {
  done: number;
  failed: number;
  remaining: number;
  current: string;
}

/**
 * Bulk statement import for a filtered slice of the problemset.
 *
 * The API's problemset.problems gives ten thousand titles, ratings and tags and has no method
 * that returns a statement, so a synced problemset is a catalogue: open a problem and there is
 * nothing to read until someone visits it. This fills a chosen slice of that catalogue in
 * advance — before a contest, or for a tag being drilled.
 *
 * The pages are read in the user's own browser, because that is the only place past the
 * Cloudflare gate for free; the server would need a headless Chromium per page. Filters are
 * the ones Codeforces' own problemset page offers, applied to the rows already in CPHub.
 */
export default function StatementImport({ initialTags = "" }: { initialTags?: string }) {
  const [open, setOpen] = useState(false);
  const [tags, setTags] = useState(initialTags);
  const [minRating, setMinRating] = useState("");
  const [maxRating, setMaxRating] = useState("");
  const [pending, setPending] = useState<PendingStatement[] | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState("");
  const [ext, setExt] = useState<"checking" | "ready" | "absent">("checking");
  // Read by the loop rather than passed into it: a state update would not reach a run that
  // is already awaiting the extension.
  const stopped = useRef(false);

  useEffect(() => {
    if (!open) return;
    hasExtension().then((present) => setExt(present ? "ready" : "absent"));
  }, [open]);

  const filters = useCallback(
    () => ({
      tags: tags.trim() || undefined,
      minRating: Number(minRating) || undefined,
      maxRating: Number(maxRating) || undefined,
    }),
    [tags, minRating, maxRating],
  );

  const preview = useCallback(async () => {
    setError("");
    setProgress(null);
    try {
      const res = await fetchMissingStatements({ ...filters(), limit: BATCH });
      setPending(res.data);
      setRemaining(res.remaining);
    } catch (err) {
      setError((err as Error).message || "Gagal membaca daftar problem");
    }
  }, [filters]);

  async function run() {
    stopped.current = false;
    setError("");
    let done = 0;
    let failed = 0;
    setProgress({ done: 0, failed: 0, remaining, current: "" });

    try {
      // Ask, fetch, repeat. The server hands out the next batch each time rather than a
      // full plan up front, so a page stored by another tab — or by simply opening the
      // problem — drops out of the list on its own.
      for (;;) {
        if (stopped.current) break;
        const next = await fetchMissingStatements({ ...filters(), limit: BATCH });
        if (next.data.length === 0) {
          setRemaining(0);
          setProgress((p) => (p ? { ...p, remaining: 0, current: "" } : p));
          break;
        }
        setRemaining(next.remaining);
        setProgress({
          done,
          failed,
          remaining: next.remaining,
          current: next.data.map((d) => d.problemId).join(", "),
        });

        const res = await fetchStatementsBatchViaExtension(next.data.map((d) => d.problemId));
        for (const r of res.results) {
          if (r.ok) done++;
          else failed++;
        }
        setProgress({ done, failed, remaining: Math.max(0, next.remaining - res.results.length), current: "" });
      }
    } catch (err) {
      if (err instanceof ExtensionMissingError) {
        setExt("absent");
        setError("Extension CPHub tidak menjawab — statement dibaca dari browser kamu, jadi extension-nya wajib.");
      } else {
        setError((err as Error).message || "Impor statement gagal");
      }
    } finally {
      setProgress((p) => (p ? { ...p, current: "" } : p));
    }
  }

  if (!open) {
    return (
      <Button variant="default" onClick={() => { setOpen(true); void preview(); }}>
        <Download className="w-3.5 h-3.5" aria-hidden="true" />
        Impor statement
      </Button>
    );
  }

  const running = progress !== null && progress.current !== "";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 overflow-y-auto">
      <div className="w-full max-w-[520px] bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-[10px] p-[16px] space-y-3 mt-[8vh]">
        <div className="flex items-start gap-3">
          <h2 className="text-[14px] font-semibold text-[#e4e4e7] flex-1">Impor statement massal</h2>
          <button
            onClick={() => { stopped.current = true; setOpen(false); }}
            aria-label="Tutup"
            className="text-[#a1a1aa] hover:text-[#e4e4e7] rounded-[4px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <p className="text-[12px] text-[#a1a1aa] leading-relaxed">
          API Codeforces tidak punya method yang mengembalikan statement, jadi problemset yang
          tersync hanya berisi judul, rating dan tag. Ini mengisi statement untuk sebagian
          problem yang kamu pilih — dibaca dari browser kamu sendiri, satu halaman sekaligus,
          dengan jeda supaya tidak kena rate limit.
        </p>

        <div className="grid grid-cols-2 gap-2">
          <label className="col-span-2 block">
            <span className="text-[11px] text-[#a1a1aa]">Tag (pisahkan dengan koma, semuanya harus cocok)</span>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="dp, trees"
              className="mt-1 w-full bg-[#0f0f10] border border-[rgba(255,255,255,0.08)] rounded-[6px] px-[10px] py-[6px] text-[12px] text-[#e4e4e7] focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]"
            />
          </label>
          <label className="block">
            <span className="text-[11px] text-[#a1a1aa]">Rating min</span>
            <input
              value={minRating}
              onChange={(e) => setMinRating(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              placeholder="1400"
              className="mt-1 w-full bg-[#0f0f10] border border-[rgba(255,255,255,0.08)] rounded-[6px] px-[10px] py-[6px] text-[12px] text-[#e4e4e7] focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]"
            />
          </label>
          <label className="block">
            <span className="text-[11px] text-[#a1a1aa]">Rating max</span>
            <input
              value={maxRating}
              onChange={(e) => setMaxRating(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              placeholder="1700"
              className="mt-1 w-full bg-[#0f0f10] border border-[rgba(255,255,255,0.08)] rounded-[6px] px-[10px] py-[6px] text-[12px] text-[#e4e4e7] focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="default" onClick={() => void preview()} disabled={running}>
            Hitung
          </Button>
          <Button variant="primary" onClick={() => void run()} disabled={running || ext !== "ready" || remaining === 0}>
            {running ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                Mengimpor...
              </>
            ) : (
              `Impor ${remaining > 0 ? `${remaining} problem` : ""}`
            )}
          </Button>
          {running && (
            <Button variant="danger" onClick={() => { stopped.current = true; }}>
              Stop
            </Button>
          )}
        </div>

        {ext === "absent" && (
          <p className="text-[11px] text-[#fbbf24]">
            Extension CPHub tidak terdeteksi. Statement dibaca dari browser kamu — tanpa
            extension, server harus melewati challenge Cloudflare sendiri dan itu satu Chromium
            per halaman.
          </p>
        )}

        {pending && !progress && (
          <p className="text-[11px] text-[#a1a1aa]">
            {remaining === 0
              ? "Semua problem yang cocok sudah punya statement."
              : `${remaining} problem cocok dan belum punya statement. Contoh: ${pending
                  .slice(0, 3)
                  .map((p) => p.problemId)
                  .join(", ")}${remaining > 3 ? "…" : ""}`}
          </p>
        )}

        {progress && (
          <div className="text-[11px] text-[#a1a1aa] space-y-1" aria-live="polite">
            <p>
              {progress.done} tersimpan
              {progress.failed > 0 && ` · ${progress.failed} gagal`}
              {progress.remaining > 0 && ` · ${progress.remaining} sisa`}
            </p>
            {progress.current && <p className="text-[#71717a]">Sedang membaca {progress.current}</p>}
            {!progress.current && progress.remaining === 0 && <p className="text-[#34d399]">Selesai.</p>}
          </div>
        )}

        {error && (
          <p role="alert" className="text-[11px] text-[#f87171]">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
