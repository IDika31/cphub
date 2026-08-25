"use client";

import { useState, useEffect, useId } from "react";
import Topbar from "@/components/shell/topbar";
import Button from "@/components/ui/button";
import { Check, Eye, EyeOff } from "lucide-react";
import { apiClient } from "@/lib/api/client";

const LANGUAGES = ["cpp17", "cpp20", "python3", "java21", "nodejs"];
const DEFAULT_TEMPLATE = `#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n  $CURSOR\n  return 0;\n}`;

function templateKey(lang: string) {
  return `cphub_template_${lang}`;
}

export default function SettingsPage() {
  const [pairingToken, setPairingToken] = useState("loading...");
  const [rotating, setRotating] = useState(false);
  const [language, setLanguage] = useState("cpp17");
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const langSelectId = useId();

  // The pairing token is "<account id>.<secret>" — per account, so two users of
  // the same CPHub install cannot sign for each other. Routed through apiClient
  // so it resolves same-origin behind the reverse proxy instead of hardcoding
  // localhost, which broke every non-local deployment.
  function loadKey(method: "GET" | "POST", path: string) {
    return apiClient<{ pairingToken?: string }>(path, { method })
      .then((d) => setPairingToken(d.pairingToken ?? "failed to load"))
      .catch(() => setPairingToken("failed to load"));
  }

  useEffect(() => {
    loadKey("GET", "/api/auth/hmac-secret");
  }, []);

  async function handleRotate() {
    if (!confirm("Rotate pairing token? Extension yang masih pakai token lama akan berhenti sync sampai di-paste ulang.")) return;
    setRotating(true);
    await loadKey("POST", "/api/auth/hmac-secret/rotate");
    setRotating(false);
    setCopied(false);
  }

  // Load the stored template whenever the selected language changes
  useEffect(() => {
    const stored = localStorage.getItem(templateKey(language));
    setTemplate(stored ?? DEFAULT_TEMPLATE);
    setSaved(false);
  }, [language]);

  function handleSave() {
    localStorage.setItem(templateKey(language), template);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  function handleCopy() {
    navigator.clipboard.writeText(pairingToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <>
      <Topbar title="Settings">
        <Button variant="primary" onClick={handleSave}>
          {saved ? (<><Check className="w-3 h-3" /> Tersimpan</>) : "Save"}
        </Button>
      </Topbar>
      <div className="flex-1 overflow-y-auto p-[14px]">
        <div className="max-w-[600px] space-y-6">
          {/* Template Section */}
          <div className="bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-[8px] p-[16px]">
            <h3 className="text-[14px] font-semibold text-[#e4e4e7] mb-3">Default Template per Bahasa</h3>
            <label htmlFor={langSelectId} className="block text-[12px] text-[#a1a1aa] mb-1">Bahasa</label>
            <select id={langSelectId} value={language} onChange={(e) => setLanguage(e.target.value)}
              className="w-full mb-3 px-[10px] py-[5px] rounded-[6px] text-[12px] font-medium bg-[#1f1f23] border border-[rgba(255,255,255,0.16)] text-[#e4e4e7] cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b]">
              {LANGUAGES.map((l) => (<option key={l} value={l}>{l}</option>))}
            </select>
            <textarea value={template} onChange={(e) => { setTemplate(e.target.value); setSaved(false); }}
              aria-label={`Template ${language}`}
              className="w-full h-[200px] px-[12px] py-[10px] rounded-[6px] text-[13px] font-mono bg-[#1f1f23] border border-[rgba(255,255,255,0.08)] text-[#e4e4e7] resize-y focus:outline-none focus:border-[#8b5cf6] transition-colors"
              spellCheck={false} />
            <p className="text-[11px] text-[#a1a1aa] mt-2">Gunakan <code className="text-[#a78bfa]">$CURSOR</code> untuk posisi awal kursor. Disimpan per bahasa.</p>
          </div>

          {/* Extension pairing token — a signing secret, so it stays masked
              until asked for. Copy works without revealing it. */}
          <div className="bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-[8px] p-[16px]">
            <h3 className="text-[14px] font-semibold text-[#e4e4e7] mb-1">Extension Pairing Token</h3>
            <p className="text-[12px] text-[#a1a1aa] mb-3">Unik per akun. Paste ke extension Settings tab untuk enable sync.</p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type={revealed ? "text" : "password"}
                readOnly
                value={pairingToken}
                aria-label="Extension pairing token"
                className="flex-1 min-w-[180px] px-[10px] py-[6px] rounded-[6px] text-[12px] font-mono bg-[#1f1f23] border border-[rgba(255,255,255,0.08)] text-[#e4e4e7] focus:outline-none focus:border-[#8b5cf6]"
              />
              <Button variant="ghost" onClick={() => setRevealed((v) => !v)} aria-pressed={revealed}>
                {revealed ? (<><EyeOff className="w-3 h-3" /> Sembunyikan</>) : (<><Eye className="w-3 h-3" /> Tampilkan</>)}
              </Button>
              <Button variant="default" onClick={handleCopy}>
                {copied ? (<><Check className="w-3 h-3" /> Tersalin</>) : "Copy"}
              </Button>
              <Button variant="ghost" onClick={handleRotate} disabled={rotating}>
                {rotating ? "..." : "Rotate"}
              </Button>
            </div>
            <p className="text-[11px] text-[#a1a1aa] mt-2" aria-live="polite">
              Rotate bikin token lama langsung tidak valid — extension harus di-paste ulang.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
