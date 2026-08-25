"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Search, CornerDownLeft, Loader2, X } from "lucide-react";
import { loadAlgos, CATEGORIES, LEVEL_ORDER, type Algo } from "@/data/dataalgo";

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c.label]),
);

const LEVEL_COLOR: Record<string, string> = {
  basic: "#34d399",
  intermediate: "#fbbf24",
  advanced: "#f87171",
};

/** Scores a match so the ranking is useful rather than alphabetical: a query
 *  that starts the name beats one that merely appears in the summary. */
function score(algo: Algo, q: string): number {
  const name = algo.name.toLowerCase();
  if (name === q) return 1000;
  if (name.startsWith(q)) return 800 - name.length;
  if (algo.id.includes(q)) return 700;
  if (algo.tags.some((t) => t === q)) return 650;
  if (name.includes(q)) return 500 - name.indexOf(q);
  if (algo.tags.some((t) => t.includes(q))) return 300;
  if (algo.summary.toLowerCase().includes(q)) return 150;
  if ((CATEGORY_LABEL[algo.category] ?? "").toLowerCase().includes(q)) return 100;
  return -1;
}

interface AlgoSearchProps {
  open: boolean;
  onClose: () => void;
  /** Inserts the snippet at the caret. Same handler the DataAlgo tab uses. */
  onImport: (code: string, name: string) => void;
}

export default function AlgoSearch({ open, onClose, onImport }: AlgoSearchProps) {
  const [algos, setAlgos] = useState<Algo[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // The library is a few hundred KB of source text, so it is fetched the first
  // time the palette is opened and then kept.
  useEffect(() => {
    if (!open || algos || failed) return;
    let alive = true;
    loadAlgos()
      .then((data) => alive && setAlgos(data))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [open, algos, failed]);

  useEffect(() => {
    if (open) {
      setCursor(0);
      // Autofocus is the point of a palette — you type immediately.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const results = useMemo(() => {
    if (!algos) return [];
    const q = query.trim().toLowerCase();
    if (!q) {
      // No query: show a stable starter set instead of an empty panel.
      return [...algos]
        .sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || a.name.localeCompare(b.name))
        .slice(0, 40);
    }
    return algos
      .map((a) => ({ a, s: score(a, q) }))
      .filter((x) => x.s >= 0)
      .sort((x, y) => y.s - x.s || x.a.name.localeCompare(y.a.name))
      .slice(0, 60)
      .map((x) => x.a);
  }, [algos, query]);

  const active = results[Math.min(cursor, results.length - 1)] ?? null;

  const insert = useCallback(
    (algo: Algo | null) => {
      if (!algo) return;
      onImport(algo.code, algo.name);
      onClose();
    },
    [onImport, onClose],
  );

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      insert(active);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  // Keep the highlighted row in view while arrowing through a long list.
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [cursor, results]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[8vh]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Cari algoritma"
        className="w-full max-w-[720px] bg-[#18181b] border border-[rgba(255,255,255,0.12)] rounded-[12px] shadow-2xl overflow-hidden flex flex-col max-h-[76vh]"
      >
        <div className="flex items-center gap-2 px-[14px] py-[10px] border-b border-[rgba(255,255,255,0.08)]">
          <Search className="w-4 h-4 text-[#a1a1aa] flex-shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Cari algoritma — segment tree, dijkstra, kmp, mod inverse..."
            aria-label="Cari algoritma"
            className="flex-1 bg-transparent text-[14px] text-[#e4e4e7] placeholder:text-[#a1a1aa] outline-none"
          />
          <span className="text-[11px] text-[#a1a1aa] tabular-nums flex-shrink-0">
            {algos ? `${results.length}/${algos.length}` : ""}
          </span>
          <button
            onClick={onClose}
            aria-label="Tutup"
            className="w-9 h-9 -mr-1 inline-flex items-center justify-center rounded-[6px] text-[#a1a1aa] hover:bg-[#1f1f23] hover:text-[#e4e4e7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {failed ? (
          <p className="px-[14px] py-[24px] text-[13px] text-[#a1a1aa] text-center">
            Library algoritma gagal dimuat. Reload halaman untuk mencoba lagi.
          </p>
        ) : !algos ? (
          <p className="px-[14px] py-[24px] text-[12px] text-[#a1a1aa] flex items-center justify-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            Memuat library algoritma...
          </p>
        ) : results.length === 0 ? (
          <p className="px-[14px] py-[24px] text-[13px] text-[#a1a1aa] text-center">
            Tidak ada yang cocok dengan &ldquo;{query.trim()}&rdquo;.
          </p>
        ) : (
          <div className="flex-1 flex min-h-0">
            <ul ref={listRef} className="w-[46%] min-w-[220px] overflow-y-auto border-r border-[rgba(255,255,255,0.08)] py-1">
              {results.map((a, i) => {
                const isActive = i === Math.min(cursor, results.length - 1);
                return (
                  <li key={a.id}>
                    <button
                      data-active={isActive}
                      onMouseEnter={() => setCursor(i)}
                      onClick={() => insert(a)}
                      className={`w-full text-left px-[12px] py-[6px] border-l-2 transition-colors ${
                        isActive ? "border-[#8b5cf6] bg-[#1f1f23]" : "border-transparent hover:bg-[#1f1f23]"
                      }`}
                    >
                      <span className={`block text-[12px] truncate ${isActive ? "text-[#f4f4f5] font-medium" : "text-[#d4d4d8]"}`}>
                        {a.name}
                      </span>
                      <span className="flex items-center gap-1.5 text-[10px] text-[#a1a1aa] mt-0.5">
                        <span style={{ color: LEVEL_COLOR[a.level] }}>{a.level}</span>
                        <span aria-hidden="true">·</span>
                        <span className="truncate">{a.complexity}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {active && (
              <div className="flex-1 min-w-0 overflow-y-auto px-[14px] py-[12px]">
                <h3 className="text-[13px] font-semibold text-[#f4f4f5]">{active.name}</h3>
                <p className="text-[11px] text-[#a1a1aa] mt-0.5">
                  {CATEGORY_LABEL[active.category] ?? active.category} · {active.complexity}
                </p>
                <p className="text-[12px] text-[#d4d4d8] leading-relaxed mt-2">{active.summary}</p>
                <p className="text-[11px] font-semibold text-[#a1a1aa] mt-3">Cara pakai</p>
                <pre className="text-[11px] font-mono text-[#e4e4e7] bg-[#0f0f10] border border-white/5 rounded-[4px] px-[8px] py-[5px] mt-1 overflow-x-auto whitespace-pre">
                  {active.usage}
                </pre>
                <pre className="mt-2 text-[11px] font-mono leading-[1.5] text-[#e4e4e7] bg-[#0f0f10] border border-white/5 rounded-[6px] p-[8px] overflow-x-auto max-h-[220px]">
                  {active.code}
                </pre>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-3 px-[14px] py-[7px] border-t border-[rgba(255,255,255,0.08)] text-[11px] text-[#a1a1aa]">
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd><Kbd>↓</Kbd> pilih
          </span>
          <span className="flex items-center gap-1">
            <Kbd><CornerDownLeft className="w-2.5 h-2.5" /></Kbd> sisipkan di kursor
          </span>
          <span className="flex items-center gap-1">
            <Kbd>Esc</Kbd> tutup
          </span>
        </div>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center px-[4px] py-[1px] text-[10px] font-mono bg-[#1f1f23] border border-[rgba(255,255,255,0.16)] rounded-[3px] text-[#a1a1aa]">
      {children}
    </kbd>
  );
}
