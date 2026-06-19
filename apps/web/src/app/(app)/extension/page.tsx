"use client";

import Topbar from "@/components/shell/topbar";
import Badge from "@/components/ui/badge";
import Button from "@/components/ui/button";
import { Puzzle, Download, ExternalLink } from "lucide-react";

export default function ExtensionPage() {
  return (
    <>
      <Topbar title="Extension" />
      <div className="flex-1 overflow-y-auto p-[14px]">
        <div className="max-w-[600px] space-y-4">
          {/* Status Card */}
          <div className="bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-[8px] p-[20px]">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-[8px] bg-[rgba(139,92,246,0.15)] text-[#8b5cf6] flex items-center justify-center">
                <Puzzle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-[14px] font-semibold text-[#e4e4e7]">CPHub Extension</h3>
                <p className="text-[12px] text-[#71717a]">v4.0.0</p>
              </div>
              <Badge variant="verdict-ac" className="ml-auto">Connected</Badge>
            </div>
          </div>

          {/* Install Guide */}
          <div className="bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-[8px] p-[20px]">
            <h3 className="text-[14px] font-semibold text-[#e4e4e7] mb-3">
              Cara Install
            </h3>
            <ol className="space-y-2 text-[13px] text-[#71717a] list-decimal pl-5">
              <li>Buka <code className="text-[#8b5cf6]">chrome://extensions</code> di Chrome</li>
              <li>Aktifkan <strong className="text-[#e4e4e7]">Developer mode</strong></li>
              <li>Klik <strong className="text-[#e4e4e7]">Load unpacked</strong></li>
              <li>Pilih folder <code className="text-[#8b5cf6]">apps/extension/dist</code></li>
              <li>Extension siap digunakan — buka halaman CF/TLX</li>
            </ol>
            <div className="flex gap-2 mt-4">
              <Button variant="primary" disabled title="Belum tersedia — build manual via apps/extension/dist">
                <Download className="w-3.5 h-3.5" /> Download Extension
              </Button>
              <Button variant="default" disabled title="Belum dipublikasikan">
                <ExternalLink className="w-3.5 h-3.5" /> Chrome Web Store
              </Button>
            </div>
            <p className="text-[11px] text-[#71717a] mt-2">Saat ini load unpacked dari <code className="text-[#8b5cf6]">apps/extension/dist</code> (lihat langkah di atas).</p>
          </div>

          {/* Keyboard Shortcuts */}
          <div className="bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-[8px] p-[20px]">
            <h3 className="text-[14px] font-semibold text-[#e4e4e7] mb-3">
              Keyboard Shortcuts
            </h3>
            <div className="space-y-2 text-[13px]">
              <div className="flex justify-between">
                <span className="text-[#71717a]">Sync current problem</span>
                <kbd className="inline-flex items-center px-[5px] py-[1px] text-[10px] font-mono bg-[#1f1f23] border border-[rgba(255,255,255,0.16)] rounded-[4px] text-[#52525b]">
                  Ctrl+Shift+S
                </kbd>
              </div>
              <div className="flex justify-between">
                <span className="text-[#71717a]">Open CPHub dashboard</span>
                <kbd className="inline-flex items-center px-[5px] py-[1px] text-[10px] font-mono bg-[#1f1f23] border border-[rgba(255,255,255,0.16)] rounded-[4px] text-[#52525b]">
                  Ctrl+Shift+O
                </kbd>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
