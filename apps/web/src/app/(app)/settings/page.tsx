"use client";

import { useState, useEffect, useId } from "react";
import Topbar from "@/components/shell/topbar";
import Button from "@/components/ui/button";
import { Check } from "lucide-react";

const LANGUAGES = ["cpp17", "cpp20", "python3", "java21", "nodejs"];
const DEFAULT_TEMPLATE = `#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n  $CURSOR\n  return 0;\n}`;

function templateKey(lang: string) {
  return `cphub_template_${lang}`;
}

export default function SettingsPage() {
  const [hmacSecret, setHmacSecret] = useState("loading...");
  const [language, setLanguage] = useState("cpp17");
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const langSelectId = useId();

  useEffect(() => {
    fetch("http://localhost:3001/api/auth/hmac-secret", {
      headers: { Authorization: `Bearer ${localStorage.getItem("cphub_token")}` },
    })
      .then((r) => r.json())
      .then((d) => setHmacSecret(d.secret))
      .catch(() => setHmacSecret("failed to load"));
  }, []);

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
    navigator.clipboard.writeText(hmacSecret);
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
            <p className="text-[11px] text-[#71717a] mt-2">Gunakan <code className="text-[#8b5cf6]">$CURSOR</code> untuk posisi awal kursor. Disimpan per bahasa.</p>
          </div>

          {/* Preferences */}
          <div className="bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-[8px] p-[16px]">
            <h3 className="text-[14px] font-semibold text-[#e4e4e7] mb-3">Preferences</h3>
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" defaultChecked className="accent-[#8b5cf6] w-4 h-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]" />
                <span className="text-[13px] text-[#e4e4e7]">Auto-sync from extension</span>
              </label>
            </div>
          </div>

          {/* Extension HMAC Secret */}
          <div className="bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-[8px] p-[16px]">
            <h3 className="text-[14px] font-semibold text-[#e4e4e7] mb-1">Extension HMAC Secret</h3>
            <p className="text-[12px] text-[#a1a1aa] mb-3">Copy secret ini ke extension Settings tab untuk enable sync.</p>
            <div className="flex items-center gap-2">
              <input type="text" readOnly value={hmacSecret} aria-label="HMAC secret"
                className="flex-1 px-[10px] py-[6px] rounded-[6px] text-[12px] font-mono bg-[#1f1f23] border border-[rgba(255,255,255,0.08)] text-[#e4e4e7] focus:outline-none focus:border-[#8b5cf6]" />
              <Button variant="default" onClick={handleCopy}>
                {copied ? (<><Check className="w-3 h-3" /> Tersalin</>) : "Copy"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
