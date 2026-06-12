"use client";

import { useState } from "react";
import Topbar from "@/components/shell/topbar";
import Button from "@/components/ui/button";

const LANGUAGES = ["cpp17", "cpp20", "python3", "java21", "nodejs"];

export default function SettingsPage() {
  const [language, setLanguage] = useState("cpp17");
  const [template, setTemplate] = useState(
    `#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n  $CURSOR\n  return 0;\n}`
  );

  return (
    <>
      <Topbar title="Settings">
        <Button variant="primary">Save</Button>
      </Topbar>
      <div className="flex-1 overflow-y-auto p-[14px]">
        <div className="max-w-[600px] space-y-6">
          {/* Template Section */}
          <div className="bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-[8px] p-[16px]">
            <h3 className="text-[14px] font-semibold text-[#e4e4e7] mb-3">
              Default Template per Bahasa
            </h3>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full mb-3 px-[10px] py-[5px] rounded-[6px] text-[12px] font-medium bg-[#1f1f23] border border-[rgba(255,255,255,0.16)] text-[#e4e4e7] cursor-pointer"
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
            <textarea
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              className="w-full h-[200px] px-[12px] py-[10px] rounded-[6px] text-[13px] font-mono bg-[#1f1f23] border border-[rgba(255,255,255,0.08)] text-[#e4e4e7] resize-none focus:outline-none focus:border-[#8b5cf6] transition-colors"
              spellCheck={false}
            />
          </div>

          {/* Preferences */}
          <div className="bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-[8px] p-[16px]">
            <h3 className="text-[14px] font-semibold text-[#e4e4e7] mb-3">
              Preferences
            </h3>
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" defaultChecked className="accent-[#8b5cf6]" />
                <span className="text-[13px] text-[#e4e4e7]">Auto-sync from extension</span>
              </label>
              <div>
                <span className="text-[13px] text-[#e4e4e7] block mb-2">Theme</span>
                <div className="flex gap-2">
                  {["Light", "Dark", "System"].map((t) => (
                    <label key={t} className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" name="theme" defaultChecked={t === "Dark"} className="accent-[#8b5cf6]" />
                      <span className="text-[12px] text-[#71717a]">{t}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
