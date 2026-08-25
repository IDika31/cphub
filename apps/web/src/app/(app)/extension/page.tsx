"use client";

import Topbar from "@/components/shell/topbar";
import Button from "@/components/ui/button";
import Kbd from "@/components/ui/kbd";
import { Puzzle, Download, ExternalLink } from "lucide-react";

const SHORTCUTS: Array<{ keys: string; action: string }> = [
  { keys: "Alt+C", action: "Buka problem yang sedang dibuka di editor CPHub" },
  { keys: "Ctrl+Shift+S", action: "Sync problem yang sedang dibuka" },
  { keys: "Ctrl+Shift+O", action: "Buka dashboard CPHub" },
];

export default function ExtensionPage() {
  return (
    <>
      <Topbar title="Extension" />
      <div className="flex-1 overflow-y-auto p-[14px]">
        <div className="max-w-[600px] space-y-4">
          {/* Identity card — the web app cannot detect whether the extension is
              installed, so it states the version it pairs with, not a status. */}
          <div className="bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-[8px] p-[20px]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-[8px] bg-[rgba(139,92,246,0.15)] text-[#a78bfa] flex items-center justify-center flex-shrink-0">
                <Puzzle className="w-5 h-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h2 className="text-[14px] font-semibold text-[#e4e4e7]">CPHub Extension</h2>
                <p className="text-[12px] text-[#a1a1aa]">v4.0.0 · Chrome / Edge (Manifest V3)</p>
              </div>
            </div>
            <p className="text-[12px] text-[#a1a1aa] mt-3">
              Sync aktif setelah pairing token dipaste di extension Settings. Token-nya ada di{" "}
              <a href="/settings" className="text-[#a78bfa] hover:underline">
                halaman Settings
              </a>
              .
            </p>
          </div>

          {/* Install Guide */}
          <div className="bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-[8px] p-[20px]">
            <h2 className="text-[14px] font-semibold text-[#e4e4e7] mb-3">
              Cara Install
            </h2>
            <ol className="space-y-2 text-[13px] text-[#a1a1aa] list-decimal pl-5">
              <li>
                <strong className="text-[#e4e4e7]">Download</strong> lewat tombol di bawah, lalu{" "}
                <strong className="text-[#e4e4e7]">ekstrak</strong> zip-nya ke sebuah folder
              </li>
              <li>Buka <code className="text-[#a78bfa] font-mono">chrome://extensions</code></li>
              <li>Aktifkan <strong className="text-[#e4e4e7]">Developer mode</strong></li>
              <li>Klik <strong className="text-[#e4e4e7]">Load unpacked</strong></li>
              <li>Pilih folder hasil ekstrak tadi</li>
              <li>Paste pairing token di extension Settings, lalu buka halaman CF/TLX</li>
            </ol>
            <div className="flex flex-wrap gap-2 mt-4">
              {/* Server rebuilds the zip when the extension source changed. */}
              <a href="/api/extension/download" download="cphub-extension.zip">
                <Button variant="primary">
                  <Download className="w-3.5 h-3.5" aria-hidden="true" /> Download Extension
                </Button>
              </a>
              <Button variant="default" disabled title="Belum dipublikasikan">
                <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" /> Chrome Web Store
              </Button>
            </div>
            <p className="text-[11px] text-[#a1a1aa] mt-2">
              Setelah install, set API Base URL di Options extension supaya mengarah ke server ini.
              Kalau build lokal, folder-nya <code className="text-[#a78bfa] font-mono">apps/extension/dist</code>.
            </p>
          </div>

          {/* Keyboard Shortcuts */}
          <div className="bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-[8px] p-[20px]">
            <h2 className="text-[14px] font-semibold text-[#e4e4e7] mb-1">
              Keyboard Shortcuts
            </h2>
            <p className="text-[11px] text-[#a1a1aa] mb-3">
              Kalau salah satu tidak jalan, biasanya bentrok dengan shortcut lain — atur ulang di{" "}
              <code className="text-[#a78bfa] font-mono">chrome://extensions/shortcuts</code>.
            </p>
            <ul className="divide-y divide-[rgba(255,255,255,0.06)]">
              {SHORTCUTS.map((s) => (
                <li key={s.keys} className="flex items-center justify-between gap-4 py-[9px] first:pt-0 last:pb-0">
                  <span className="text-[13px] text-[#a1a1aa]">{s.action}</span>
                  <Kbd className="flex-shrink-0">{s.keys}</Kbd>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
