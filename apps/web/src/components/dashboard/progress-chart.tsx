"use client";

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import type { SeriesPoint } from "@/lib/api/dashboard";

const TOOLTIP_STYLE = {
  background: "#0f0f10",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 8,
  fontSize: 12,
  color: "#e4e4e7",
} as const;

function shortDate(unix: number) {
  if (!unix) return "";
  return new Date(unix * 1000).toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
}

/** One series, one chart. Codeforces passes its rating history; TLX passes the
 *  cumulative count of distinct solved problems, because TLX has no rating and
 *  inventing one would be worse than showing what it actually measures. */
export default function ProgressChart({
  points, color, valueName, height = 200, id,
}: {
  points: SeriesPoint[];
  color: string;
  valueName: string;
  height?: number;
  id: string;
}) {
  const data = points.map((p, i) => ({ ...p, i }));
  const min = Math.min(...data.map((d) => d.value));
  const max = Math.max(...data.map((d) => d.value));
  const pad = Math.max(Math.round((max - min) * 0.15), 1);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: -18 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={shortDate}
          tick={{ fill: "#a1a1aa", fontSize: 10 }}
          stroke="rgba(255,255,255,0.12)"
          minTickGap={24}
        />
        <YAxis
          domain={[Math.max(min - pad, 0), max + pad]}
          tick={{ fill: "#a1a1aa", fontSize: 10 }}
          stroke="rgba(255,255,255,0.12)"
          width={44}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          formatter={(v: number) => [v, valueName]}
          labelFormatter={(_l, payload) => {
            const p = payload?.[0]?.payload as SeriesPoint | undefined;
            if (!p) return "";
            return p.label || shortDate(p.date);
          }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          fill={`url(#${id})`}
          dot={{ r: 2, fill: color }}
          activeDot={{ r: 5 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
