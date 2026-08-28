"use client";

import { useMemo, useRef, useState } from "react";
import type { ActivityDay } from "@/lib/api/dashboard";

const DAY_MS = 86_400_000;
const WEEKDAYS = ["Sen", "", "Rab", "", "Jum", "", "Min"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

// Cells are laid out with gridAutoFlow: "column", so DOM order is day-sequential
// and every column is one week: up/down moves a day, left/right moves a week.
const ARROW_STEP: Record<string, number> = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 };

function level(count: number, max: number) {
  if (count <= 0) return 0;
  if (max <= 1) return 4;
  const ratio = count / max;
  if (ratio > 0.66) return 4;
  if (ratio > 0.4) return 3;
  if (ratio > 0.15) return 2;
  return 1;
}

const LEVEL_BG = [
  "#1f1f23",
  "rgba(139,92,246,0.28)",
  "rgba(139,92,246,0.5)",
  "rgba(139,92,246,0.72)",
  "#a78bfa",
];

/** Calendar heatmap built from a plain CSS grid — 53 columns of 7 days, oldest
 *  week first. The previous endpoint emitted epoch-day numbers instead of dates,
 *  so nothing could be drawn at all. */
export default function ActivityHeatmap({
  days, weeks = 26,
}: {
  days: ActivityDay[];
  weeks?: number;
}) {
  const [hover, setHover] = useState<string | null>(null);

  const { cells, max, monthMarks, totalSubs, activeDays } = useMemo(() => {
    const byDate = new Map(days.map((d) => [d.date, d]));

    // End on today, start on the Monday that makes a whole number of weeks.
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const end = today.getTime();
    const isoDow = (today.getUTCDay() + 6) % 7; // Monday = 0
    const start = end - (weeks - 1) * 7 * DAY_MS - isoDow * DAY_MS;

    const cells: Array<{ date: string; count: number; solved: number; byProvider: Record<string, number> } | null> = [];
    let max = 0;
    let totalSubs = 0;
    let activeDays = 0;

    for (let t = start; t <= end; t += DAY_MS) {
      const iso = new Date(t).toISOString().slice(0, 10);
      const hit = byDate.get(iso);
      const count = hit?.count ?? 0;
      if (count > max) max = count;
      if (count > 0) {
        activeDays++;
        totalSubs += count;
      }
      cells.push({ date: iso, count, solved: hit?.solved ?? 0, byProvider: hit?.byProvider ?? {} });
    }

    // One label per month, placed on the column where that month first appears.
    // The grid always starts on a Monday, so days 1-7 of a month fall in a single
    // column only when the 1st is a Monday; otherwise two columns each hold a day
    // <= 7. Dropping duplicates per column let both of them through, and two 9px
    // labels one 14px pitch apart collided into "AprApr". Cells are in ascending
    // date order, so remembering the last month is enough.
    const monthMarks: Array<{ col: number; label: string }> = [];
    let lastMonthKey = "";
    cells.forEach((cell, i) => {
      if (!cell) return;
      const d = new Date(cell.date + "T00:00:00Z");
      if (d.getUTCDate() > 7) return;
      const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
      if (key === lastMonthKey) return;
      lastMonthKey = key;
      monthMarks.push({ col: Math.floor(i / 7), label: MONTHS[d.getUTCMonth()] });
    });

    return { cells, max, monthMarks, totalSubs, activeDays };
  }, [days, weeks]);

  const columns = Math.ceil(cells.length / 7);
  const active = hover ? cells.find((c) => c?.date === hover) : null;

  // One tab stop for the whole grid, starting on today and moved with the arrow
  // keys. Every cell used to carry tabIndex={-1}, so the per-day counts were
  // reachable by mouse only; making all 182 of them tabbable instead would cost a
  // keyboard user 182 Tab presses to cross one widget.
  const [focusIdx, setFocusIdx] = useState(cells.length - 1);
  const focus = Math.min(Math.max(focusIdx, 0), cells.length - 1);
  const cellRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function moveFocus(step: number) {
    const next = Math.min(Math.max(focus + step, 0), cells.length - 1);
    setFocusIdx(next);
    cellRefs.current[next]?.focus();
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-2 text-[11px] text-[#a1a1aa]">
        <span>
          {totalSubs} submission · {activeDays} hari aktif
        </span>
        <span className="flex items-center gap-1">
          Sedikit
          {LEVEL_BG.map((bg, i) => (
            <span key={i} className="w-[9px] h-[9px] rounded-[2px]" style={{ background: bg }} />
          ))}
          Banyak
        </span>
      </div>

      <div className="overflow-x-auto pb-1">
        <div className="inline-flex gap-[3px]">
          <div className="grid grid-rows-7 gap-[3px] pr-1 pt-[14px]">
            {WEEKDAYS.map((d, i) => (
              <span key={i} className="text-[9px] text-[#a1a1aa] h-[11px] leading-[11px] w-[20px] text-right">
                {d}
              </span>
            ))}
          </div>

          <div>
            <div
              className="grid gap-[3px] mb-[3px]"
              style={{ gridTemplateColumns: `repeat(${columns}, 11px)` }}
            >
              {Array.from({ length: columns }).map((_, col) => {
                const mark = monthMarks.find((m) => m.col === col);
                return (
                  <span key={col} className="text-[9px] text-[#a1a1aa] h-[11px] leading-[11px] whitespace-nowrap">
                    {mark?.label ?? ""}
                  </span>
                );
              })}
            </div>

            <div
              className="grid grid-rows-7 gap-[3px]"
              style={{ gridAutoFlow: "column", gridTemplateColumns: `repeat(${columns}, 11px)` }}
              // role="img" made every cell a presentational child, so neither the
              // titles nor the per-day labels below reached the accessibility tree.
              role="group"
              aria-label={`Aktivitas ${weeks} minggu terakhir: ${totalSubs} submission dalam ${activeDays} hari aktif`}
              onKeyDown={(e) => {
                const step = ARROW_STEP[e.key];
                if (!step) return;
                e.preventDefault();
                moveFocus(step);
              }}
            >
              {cells.map((cell, i) =>
                cell ? (
                  <button
                    key={cell.date}
                    type="button"
                    ref={(el) => { cellRefs.current[i] = el; }}
                    tabIndex={i === focus ? 0 : -1}
                    onMouseEnter={() => setHover(cell.date)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => { setFocusIdx(i); setHover(cell.date); }}
                    onBlur={() => setHover(null)}
                    title={`${cell.date}: ${cell.count} submission, ${cell.solved} AC`}
                    aria-label={`${cell.date}: ${cell.count} submission, ${cell.solved} AC`}
                    className="w-[11px] h-[11px] rounded-[2px] cursor-default"
                    style={{ background: LEVEL_BG[level(cell.count, max)] }}
                  />
                ) : (
                  <span key={i} className="w-[11px] h-[11px]" />
                ),
              )}
            </div>
          </div>
        </div>
      </div>

      <p className="text-[11px] text-[#a1a1aa] mt-2 h-[15px]" aria-live="polite">
        {active && active.count > 0
          ? `${active.date} — ${active.count} submission, ${active.solved} AC${
              Object.keys(active.byProvider).length
                ? ` (${Object.entries(active.byProvider).map(([p, n]) => `${p}: ${n}`).join(", ")})`
                : ""
            }`
          : active
            ? `${active.date} — tidak ada submission`
            : ""}
      </p>
    </div>
  );
}
