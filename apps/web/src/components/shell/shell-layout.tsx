"use client";

import { useState, useEffect } from "react";
import { Menu, X } from "lucide-react";
import Sidebar from "./sidebar";

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileOverlay, setMobileOverlay] = useState(false);

  useEffect(() => {
    function check() {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      setSidebarOpen(!mobile);
    }
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  if (isMobile) {
    return (
      <div className="flex h-screen overflow-hidden bg-[#0f0f10]">
        {/* Mobile overlay */}
        {mobileOverlay && (
          <div className="fixed inset-0 z-40 flex">
            <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOverlay(false)} />
            <div className="relative z-50">
              <Sidebar />
            </div>
          </div>
        )}

        {/* Mobile header */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="h-[44px] border-b border-[rgba(255,255,255,0.08)] flex items-center px-[14px] bg-[#18181b]">
            <button
              onClick={() => setMobileOverlay(true)}
              className="p-1 mr-3 rounded-[6px] text-[#71717a] hover:bg-[#1f1f23] hover:text-[#e4e4e7]"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="text-[16px] font-semibold text-[#8b5cf6]">CPHub</span>
          </div>
          <main className="flex-1 flex flex-col min-h-0">{children}</main>
        </div>
      </div>
    );
  }

  // Desktop: collapsible sidebar
  return (
    <div className="flex h-screen overflow-hidden bg-[#0f0f10]">
      {sidebarOpen && <Sidebar />}
      {!sidebarOpen && (
        <div className="w-[44px] flex flex-col items-center py-[10px] gap-3 bg-[#18181b] border-r border-[rgba(255,255,255,0.08)]">
          <button onClick={() => setSidebarOpen(true)} className="p-1 rounded-[6px] text-[#71717a] hover:bg-[#1f1f23] hover:text-[#e4e4e7]">
            <Menu className="w-4 h-4" />
          </button>
        </div>
      )}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Collapse indicator */}
        {sidebarOpen && (
          <div className="absolute left-[216px] top-[10px] z-10">
            <button
              onClick={() => setSidebarOpen(false)}
              className="w-5 h-5 flex items-center justify-center rounded-full bg-[#1f1f23] border border-[rgba(255,255,255,0.08)] text-[#52525b] hover:text-[#e4e4e7] hover:bg-[#18181b]"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
