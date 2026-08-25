"use client";

import { useState, useEffect } from "react";
import { Menu } from "lucide-react";
import Sidebar from "./sidebar";

/** Desktop/mobile split is done in CSS (`md:` breakpoints) rather than by
 *  measuring window width in an effect — measuring paints the wrong layout
 *  first and then jumps. Collapse itself lives entirely in <Sidebar/>, so there
 *  is exactly one collapse control instead of two competing ones. */
export default function ShellLayout({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!drawerOpen) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setDrawerOpen(false);
    }
    document.addEventListener("keydown", onEsc);

    // Growing past the breakpoint hides the drawer via CSS; close it too so the
    // body scroll lock does not outlive it.
    const desktop = window.matchMedia("(min-width: 768px)");
    function onDesktop(e: MediaQueryListEvent) {
      if (e.matches) setDrawerOpen(false);
    }
    desktop.addEventListener("change", onDesktop);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onEsc);
      desktop.removeEventListener("change", onDesktop);
    };
  }, [drawerOpen]);

  return (
    <div className="flex h-screen overflow-hidden bg-[#0f0f10]">
      {/* Desktop: sidebar inline */}
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      {/* Mobile: sidebar as a dismissable drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <button
            type="button"
            aria-label="Tutup menu"
            className="absolute inset-0 bg-black/60"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="relative z-50">
            {/* Tapping a link must dismiss the drawer, otherwise it keeps
                covering the page the user just navigated to. */}
            <Sidebar onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <div className="md:hidden h-[44px] border-b border-[rgba(255,255,255,0.08)] flex items-center px-[14px] bg-[#18181b] flex-shrink-0">
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Buka menu"
            aria-expanded={drawerOpen}
            className="w-9 h-9 -ml-1 mr-2 inline-flex items-center justify-center rounded-[6px] text-[#a1a1aa] hover:bg-[#1f1f23] hover:text-[#e4e4e7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-[16px] font-semibold text-[#a78bfa]">CPHub</span>
        </div>
        <main className="flex-1 flex flex-col min-h-0">{children}</main>
      </div>
    </div>
  );
}
