import { useState, useEffect } from "react";
import { MESSAGE_TYPES } from "../shared/messages";
import { pingAPI } from "../shared/api";
import { getSetting, getSyncedCount } from "../shared/storage";

type Tab = "sync" | "status" | "settings";

export default function App() {
  const [tab, setTab] = useState<Tab>("sync");
  const [status, setStatus] = useState<{ apiOk: boolean; latencyMs: number; syncedCount: number }>({
    apiOk: false,
    latencyMs: 0,
    syncedCount: 0,
  });

  useEffect(() => {
    loadStatus();
  }, []);

  async function loadStatus() {
    try {
      const res = await pingAPI();
      const count = await getSyncedCount();
      setStatus({ apiOk: res.status === "ok", latencyMs: res.latencyMs, syncedCount: count });
    } catch {
      setStatus((s) => ({ ...s, apiOk: false }));
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 h-10 border-b border-[rgba(255,255,255,0.08)] bg-[#18181b]">
        <span className="text-[13px] font-semibold text-[#8b5cf6]">CPHub</span>
        <span className="text-[10px] text-[#52525b]">
          {status.apiOk ? (
            <span className="text-[#10b981]">● Connected</span>
          ) : (
            <span className="text-[#ef4444]">● Offline</span>
          )}
        </span>
      </div>

      {/* Tab Bar */}
      <div className="flex border-b border-[rgba(255,255,255,0.08)] bg-[#18181b]">
        {(["sync", "status", "settings"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 h-8 text-[11px] font-medium transition-colors ${
              tab === t
                ? "text-[#8b5cf6] border-b-2 border-[#8b5cf6]"
                : "text-[#71717a] hover:text-[#e4e4e7] border-b-2 border-transparent"
            }`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 p-3">
        {tab === "sync" && (
          <div className="space-y-3">
            <button
              className="w-full py-2 rounded-[6px] text-[12px] font-medium bg-[#8b5cf6] text-white hover:bg-[#7c3aed] transition-colors"
              onClick={async () => {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (tab?.id) {
                  chrome.tabs.sendMessage(tab.id, { type: MESSAGE_TYPES.SYNC_PROBLEM });
                }
              }}
            >
              Sync This Problem
            </button>
            <div className="text-[11px] text-[#71717a]">
              {status.syncedCount > 0
                ? `${status.syncedCount} problems synced this session`
                : "No problems synced yet"}
            </div>
          </div>
        )}

        {tab === "status" && (
          <div className="space-y-2 text-[12px]">
            <div className="flex justify-between">
              <span className="text-[#71717a]">API</span>
              <span className={status.apiOk ? "text-[#10b981]" : "text-[#ef4444]"}>
                {status.apiOk ? `${status.latencyMs}ms` : "Offline"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#71717a]">Extension</span>
              <span className="text-[#52525b]">v4.0.0</span>
            </div>
            <button
              onClick={loadStatus}
              className="mt-2 w-full py-1.5 rounded-[6px] text-[11px] bg-[#1f1f23] border border-[rgba(255,255,255,0.08)] text-[#71717a] hover:text-[#e4e4e7] transition-colors"
            >
              Refresh
            </button>
          </div>
        )}

        {tab === "settings" && (
          <div className="space-y-3 text-[12px]">
            <div>
              <label className="block text-[11px] text-[#71717a] mb-1">API URL</label>
              <input
                type="text"
                defaultValue="http://localhost:3001"
                className="w-full px-2 py-1.5 rounded-[4px] text-[12px] bg-[#1f1f23] border border-[rgba(255,255,255,0.08)] text-[#e4e4e7]"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#71717a] mb-1">HMAC Secret</label>
              <input
                type="password"
                className="w-full px-2 py-1.5 rounded-[4px] text-[12px] bg-[#1f1f23] border border-[rgba(255,255,255,0.08)] text-[#e4e4e7]"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
