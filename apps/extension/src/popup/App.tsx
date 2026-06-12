import { useState, useEffect } from "react";
import { pingAPI } from "../shared/api";
import { getSyncedCount } from "../shared/storage";
import { MESSAGE_TYPES } from "../shared/messages";

type Tab = "sync" | "status";

export default function App() {
  const [tab, setTab] = useState<Tab>("sync");
  const [apiOk, setApiOk] = useState(false);
  const [latency, setLatency] = useState(0);
  const [syncedCount, setSyncedCount] = useState(0);
  const [apiUrl, setApiUrl] = useState("http://localhost:3001");
  const [hmacSecret, setHmacSecret] = useState("");
  const [saved, setSaved] = useState(false);

  async function loadStatus() {
    try {
      const res = await pingAPI();
      setApiOk(res.status === "ok");
      setLatency(res.latencyMs);
      setSyncedCount(await getSyncedCount());
    } catch { setApiOk(false); }
  }

  useEffect(() => {
    loadStatus();
    chrome.storage.local.get(["cphub_apiUrl", "cphub_hmacSecret"], (r) => {
      if (r.cphub_apiUrl) setApiUrl(r.cphub_apiUrl);
      if (r.cphub_hmacSecret) setHmacSecret(r.cphub_hmacSecret);
    });
  }, []);

  function saveSettings() {
    chrome.storage.local.set({ cphub_apiUrl: apiUrl, cphub_hmacSecret: hmacSecret });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleSync() {
    const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (t?.id) chrome.tabs.sendMessage(t.id, { type: MESSAGE_TYPES.SYNC_PROBLEM });
    window.close();
  }

  return (
    <div className="flex flex-col min-h-[420px]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 h-10 bg-surface border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-accent flex items-center justify-center text-[10px] font-bold text-white">C</div>
          <span className="text-[13px] font-semibold text-accent">CPHub</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${apiOk ? "bg-green" : "bg-red"}`} />
          <span className={`text-[10px] ${apiOk ? "text-green" : "text-red"}`}>{apiOk ? "Connected" : "Offline"}</span>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex bg-surface border-b border-white/10">
        {(["sync", "status"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 h-8 text-[11px] font-medium transition-colors ${
              tab === t ? "text-accent border-b-2 border-accent" : "text-subtle hover:text-white border-b-2 border-transparent"
            }`}
          >
            {t === "sync" ? "Sync" : "Status"}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 p-3 space-y-3">
        {/* Settings (always visible, compact) */}
        <details className="group">
          <summary className="text-[11px] text-subtle cursor-pointer hover:text-white transition-colors select-none">
            Settings
          </summary>
          <div className="mt-2 space-y-2">
            <div>
              <label className="block text-[10px] text-muted mb-0.5 uppercase tracking-wide">API URL</label>
              <input
                type="text"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                className="w-full px-2 py-1.5 rounded-[4px] text-[11px] bg-surface-2 border border-white/10 text-white outline-none focus:border-accent transition-colors"
              />
            </div>
            <div>
              <label className="block text-[10px] text-muted mb-0.5 uppercase tracking-wide">HMAC Secret</label>
              <input
                type="password"
                value={hmacSecret}
                onChange={(e) => setHmacSecret(e.target.value)}
                className="w-full px-2 py-1.5 rounded-[4px] text-[11px] bg-surface-2 border border-white/10 text-white outline-none focus:border-accent transition-colors font-mono"
                placeholder="Paste from CPHub Settings"
              />
            </div>
            <button
              onClick={saveSettings}
              className="w-full py-1.5 rounded-[4px] text-[11px] font-medium bg-accent text-white hover:bg-accent-hover transition-colors"
            >
              {saved ? "✓ Saved" : "Save"}
            </button>
          </div>
        </details>

        {tab === "sync" && (
          <div className="space-y-3 pt-1">
            <button
              onClick={handleSync}
              className="w-full py-2.5 rounded-[6px] text-[13px] font-semibold bg-accent text-white hover:bg-accent-hover transition-colors active:scale-[0.98]"
            >
              Sync This Problem
            </button>

            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-subtle">Problems synced</span>
                <span className="text-white font-medium">{syncedCount}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-subtle">API status</span>
                <span className={apiOk ? "text-green" : "text-red"}>{apiOk ? `${latency}ms` : "Offline"}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-subtle">Version</span>
                <span className="text-muted">v4.0.0</span>
              </div>
            </div>

            <p className="text-[10px] text-muted leading-relaxed">
              Buka halaman problem Codeforces atau TLX, lalu klik Sync.
            </p>
          </div>
        )}

        {tab === "status" && (
          <div className="space-y-3 pt-1">
            <div className="p-3 rounded-[6px] bg-surface-2 border border-white/10 space-y-2">
              {[
                ["API Connection", apiOk, apiOk ? `${latency}ms` : "Failed"],
                ["HMAC Secret", !!hmacSecret, hmacSecret ? "Configured" : "Not set"],
                ["Problems Synced", true, `${syncedCount}`],
              ].map(([label, ok, detail]) => (
                <div key={label as string} className="flex items-center justify-between">
                  <span className="text-[11px] text-subtle">{label as string}</span>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${ok ? "bg-green" : "bg-red"}`} />
                    <span className={`text-[11px] ${ok ? "text-white" : "text-red"}`}>{detail as string}</span>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={loadStatus} className="w-full py-1.5 rounded-[4px] text-[11px] text-subtle bg-surface-2 border border-white/10 hover:text-white hover:bg-surface transition-colors">
              Refresh
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-white/10 text-center">
        <span className="text-[9px] text-muted">CPHub V4 · Competitive Programming Hub</span>
      </div>
    </div>
  );
}
