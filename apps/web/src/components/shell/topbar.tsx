"use client";

import { ReactNode } from "react";

interface TopbarProps {
  title: string;
  children?: ReactNode;
}

export default function Topbar({ title, children }: TopbarProps) {
  return (
    <div className="h-[44px] border-b border-[rgba(255,255,255,0.08)] flex items-center gap-[10px] px-[14px] flex-shrink-0 bg-[#18181b]">
      <h1 className="text-[14px] font-semibold text-[#e4e4e7] whitespace-nowrap">
        {title}
      </h1>
      <div className="flex-1" />
      {children}
    </div>
  );
}
