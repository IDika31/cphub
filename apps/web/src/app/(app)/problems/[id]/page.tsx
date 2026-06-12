"use client";

import { useParams } from "next/navigation";
import { Play, Sun } from "lucide-react";
import Topbar from "@/components/shell/topbar";
import Badge from "@/components/ui/badge";
import Button from "@/components/ui/button";
import Skeleton from "@/components/ui/skeleton";
import ThemeToggle from "@/components/ui/theme-toggle";

export default function ProblemDetailPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <>
      <Topbar title={`Problem Detail`}>
        <Badge variant="cf">Codeforces</Badge>
        <Badge variant="time">2s / 512 MB</Badge>
        <div className="flex-1" />
        <ThemeToggle />
        <Button variant="ghost">Template</Button>
        <Button variant="ghost">Reset</Button>
        <Button variant="primary">
          <Play className="w-3 h-3" /> Run
        </Button>
      </Topbar>

      <div className="flex-1 flex min-h-0">
        {/* Left: Statement */}
        <div className="w-[42%] overflow-y-auto p-[14px] border-r border-[rgba(255,255,255,0.08)]">
          <div className="bg-[#18181b] rounded-[8px] border border-[rgba(255,255,255,0.08)] p-[16px]">
            <h2 className="text-[16px] font-semibold text-[#e4e4e7] mb-3">
              Problem {id}
            </h2>
            <p className="text-[13px] text-[#71717a] leading-relaxed">
              Problem statement will appear here after syncing from Codeforces or TLX.
            </p>
          </div>
        </div>

        {/* Resize Handle */}
        <div className="w-[5px] flex-shrink-0 cursor-col-resize bg-[rgba(255,255,255,0.08)] hover:bg-[#8b5cf6] transition-colors" />

        {/* Right: Editor + Grader */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Editor */}
          <div className="flex-[3] min-h-0 bg-[#0f0f10] flex items-center justify-center">
            <Skeleton className="w-full h-full" />
          </div>

          {/* Row Resize */}
          <div className="h-[5px] flex-shrink-0 cursor-row-resize bg-[rgba(255,255,255,0.08)] hover:bg-[#8b5cf6] transition-colors" />

          {/* Grader Panel */}
          <div className="flex-[2] min-h-0 bg-[#18181b]">
            <div className="flex border-b border-[rgba(255,255,255,0.08)] bg-[#18181b]">
              <button className="px-[14px] text-[12px] font-medium text-[#8b5cf6] border-b-2 border-[#8b5cf6] flex items-center gap-[5px] h-[34px]">
                Grader
              </button>
              <button className="px-[14px] text-[12px] text-[#71717a] hover:text-[#e4e4e7] border-b-2 border-transparent flex items-center gap-[5px] h-[34px]">
                Test Cases
                <span className="min-w-[16px] h-4 px-1 rounded-full text-[10px] font-semibold bg-[rgba(139,92,246,0.15)] text-[#8b5cf6] inline-flex items-center justify-center">
                  0
                </span>
              </button>
            </div>
            <div className="p-[14px] text-[12px] text-[#52525b]">
              Run your code to see results here
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
