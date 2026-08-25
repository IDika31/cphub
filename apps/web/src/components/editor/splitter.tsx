"use client";

import { useRef, type RefObject } from "react";

interface SplitterProps {
  orientation: "vertical" | "horizontal";
  /** Current size of the leading pane, in percent of the container. */
  value: number;
  onChange: (pct: number) => void;
  containerRef: RefObject<HTMLDivElement | null>;
  min?: number;
  max?: number;
  label: string;
}

/**
 * Drag handle between two panes. Sizes live in the parent as percentages, so a
 * window resize keeps the ratio, and the handle is a real separator widget:
 * focusable and operable with the arrow keys, which the old mousedown-only
 * div was not.
 */
export default function Splitter({
  orientation,
  value,
  onChange,
  containerRef,
  min = 20,
  max = 80,
  label,
}: SplitterProps) {
  const dragging = useRef(false);
  const isVertical = orientation === "vertical";

  function clamp(pct: number) {
    return Math.max(min, Math.min(max, pct));
  }

  function pctFromPointer(clientX: number, clientY: number) {
    const box = containerRef.current?.getBoundingClientRect();
    if (!box) return value;
    return isVertical
      ? ((clientX - box.left) / box.width) * 100
      : ((clientY - box.top) / box.height) * 100;
  }

  return (
    <div
      role="separator"
      aria-orientation={isVertical ? "vertical" : "horizontal"}
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!dragging.current) return;
        onChange(clamp(pctFromPointer(e.clientX, e.clientY)));
      }}
      onPointerUp={(e) => {
        dragging.current = false;
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onKeyDown={(e) => {
        const back = isVertical ? "ArrowLeft" : "ArrowUp";
        const fwd = isVertical ? "ArrowRight" : "ArrowDown";
        if (e.key === back) onChange(clamp(value - 2));
        else if (e.key === fwd) onChange(clamp(value + 2));
        else if (e.key === "Home") onChange(min);
        else if (e.key === "End") onChange(max);
        else return;
        e.preventDefault();
      }}
      className={`flex-shrink-0 bg-[rgba(255,255,255,0.08)] hover:bg-[#8b5cf6] focus-visible:bg-[#8b5cf6] focus-visible:outline-none transition-colors touch-none ${
        isVertical ? "w-[5px] cursor-col-resize" : "h-[5px] cursor-row-resize"
      }`}
    />
  );
}
