import { useState, useEffect } from "react";
import { pingAPI } from "../shared/api";
import { getSyncedCount } from "../shared/storage";
import { MESSAGE_TYPES } from "../shared/messages";

type Tab = "sync" | "status" | "settings";

export default function App() {
  const [tab, setTab] = useState<Tab>("sync");
  const [apiOk, setApiOk] = useState(false);
  const [latency, setLatency] = useState(0);
  const [syncedCount, setSyncedCount] = useState(0);
  const [apiUrl, setApiUrl] = useState("http://localhost:3001");
  const [webUrl, setWebUrl] = useState("http://localhost:3000");
  const [pairingToken, setPairingToken] = useState("");
  const [saved, setSaved] = useState(false);
  const [syncing, setSyncing] = useState(false);
  // name is a label the user picks for the instance; host stays the identity, so
  // CPHub can show "COMPFEST CPC" instead of the raw hostname.
  const [customHosts, setCustomHosts] = useState<{host: string; apiHost?: string; name?: string}[]>([]);
  const [newHost, setNewHost] = useState("");
  const [newApiHost, setNewApiHost] = useState("");
  const [newName, setNewName] = useState("");

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
    chrome.storage.local.get(["cphub_apiUrl", "cphub_webUrl", "cphub_pairingToken"], (r) => {
      if (r.cphub_apiUrl) setApiUrl(r.cphub_apiUrl);
      if (r.cphub_webUrl) setWebUrl(r.cphub_webUrl);
      if (r.cphub_pairingToken) setPairingToken(r.cphub_pairingToken);
    });
    chrome.storage.sync.get("customTlxHosts", (r) => {
      setCustomHosts(r.customTlxHosts ?? []);
    });
  }, []);

  function saveSettings() {
    chrome.storage.local.set({ cphub_apiUrl: apiUrl.trim().replace(/\/+$/, ""), cphub_webUrl: webUrl.trim().replace(/\/+$/, ""), cphub_pairingToken: pairingToken.trim() });
    chrome.storage.sync.set({ customTlxHosts: customHosts });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function addHost() {
    const host = newHost.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!host || customHosts.some((h) => h.host === host) || host === "tlx.toki.id") return;
    const apiHost = newApiHost.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    const name = newName.trim().slice(0, 100);
    const next = [...customHosts, { host, ...(apiHost ? { apiHost } : {}), ...(name ? { name } : {}) }];
    setCustomHosts(next);
    setNewHost("");
    setNewApiHost("");
    setNewName("");
    chrome.storage.sync.set({ customTlxHosts: next });
  }

  function removeHost(host: string) {
    const next = customHosts.filter((h) => h.host !== host);
    setCustomHosts(next);
    chrome.storage.sync.set({ customTlxHosts: next });
  }

  async function handleSync() {
    setSyncing(true);
    const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (t?.id) chrome.tabs.sendMessage(t.id, { type: MESSAGE_TYPES.SYNC_PROBLEM });
    setTimeout(() => window.close(), 600);
  }

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: "sync", label: "Sync", icon: "↗" },
    { key: "status", label: "Status", icon: "◈" },
    { key: "settings", label: "Settings", icon: "⚙" },
  ];

  return (
    <div className="flex flex-col min-h-[480px] bg-bg">
      {/* Header */}
      <div className="relative bg-gradient-to-r from-blue-600 to-blue-500 px-4 pt-4 pb-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/20 backdrop-blur flex items-center justify-center text-sm font-bold text-white shadow-soft">
              C
            </div>
            <div>
              <h1 className="text-[15px] font-semibold text-white leading-tight">CPHub</h1>
              <p className="text-[10px] text-blue-100 leading-tight">Competitive Programming Hub</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 bg-white/15 backdrop-blur rounded-full px-2.5 py-1">
            <span className={`w-2 h-2 rounded-full ${apiOk ? "bg-green-light" : "bg-red-light"} shadow-sm`} />
            <span className="text-[10px] font-medium text-white">
              {apiOk ? "Online" : "Offline"}
            </span>
          </div>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex bg-bg px-3 -mt-3 relative z-10 gap-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg text-[11px] font-medium transition-all ${
              tab === t.key
                ? "bg-white text-blue-600 shadow-card"
                : "text-subtle hover:text-primary hover:bg-surface"
            }`}
          >
            <span className="text-[13px]">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-3 space-y-3 overflow-y-auto">
        {tab === "sync" && (
          <>
            {/* Sync Button */}
            <button
              onClick={handleSync}
              disabled={syncing}
              className="w-full py-3 rounded-xl text-[14px] font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 transition-all active:scale-[0.98] shadow-card disabled:opacity-70"
            >
              {syncing ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Syncing...
                </span>
              ) : (
                "Sync This Problem"
              )}
            </button>

            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-surface rounded-xl p-3 text-center">
                <p className="text-[18px] font-bold text-blue-600">{syncedCount}</p>
                <p className="text-[10px] text-muted mt-0.5">Synced</p>
              </div>
              <div className="bg-surface rounded-xl p-3 text-center">
                <p className={`text-[18px] font-bold ${apiOk ? "text-green" : "text-red"}`}>
                  {apiOk ? `${latency}` : "—"}
                </p>
                <p className="text-[10px] text-muted mt-0.5">{apiOk ? "ms" : "Offline"}</p>
              </div>
              <div className="bg-surface rounded-xl p-3 text-center">
                <p className="text-[18px] font-bold text-primary">v4</p>
                <p className="text-[10px] text-muted mt-0.5">Version</p>
              </div>
            </div>

            {/* Help */}
            <div className="bg-blue-50 rounded-xl p-3 border border-blue-200">
              <p className="text-[11px] text-blue-700 leading-relaxed">
                Buka halaman problem di Codeforces atau TLX, lalu klik <strong>Sync This Problem</strong> untuk menyimpan ke CPHub.
              </p>
            </div>
          </>
        )}

        {tab === "status" && (
          <>
            <div className="bg-surface rounded-xl p-1 space-y-0.5">
              {[
                { label: "API Connection", ok: apiOk, detail: apiOk ? `${latency}ms` : "Failed", icon: "◉" },
                { label: "Pairing Token", ok: !!pairingToken, detail: pairingToken ? "Paired" : "Not set — sync will be refused", icon: "⊡" },
                { label: "Problems Synced", ok: true, detail: `${syncedCount}`, icon: "◫" },
                { label: "Custom TLX Hosts", ok: true, detail: `${customHosts.length} host${customHosts.length !== 1 ? "s" : ""}`, icon: "◈" },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-white transition-colors">
                  <div className="flex items-center gap-2.5">
                    <span className="text-blue-500 text-[14px]">{item.icon}</span>
                    <span className="text-[12px] text-secondary">{item.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[12px] font-medium ${item.ok ? "text-primary" : "text-red"}`}>
                      {item.detail}
                    </span>
                    <span className={`w-2 h-2 rounded-full ${item.ok ? "bg-green" : "bg-red"}`} />
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={loadStatus}
              className="w-full py-2.5 rounded-xl text-[12px] font-medium text-blue-600 bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-colors"
            >
              Refresh Status
            </button>
          </>
        )}

        {tab === "settings" && (
          <>
            {/* API URL */}
            <div>
              <label className="block text-[11px] font-medium text-secondary mb-1.5">API URL</label>
              <input
                type="text"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-[12px] bg-surface border border-border text-primary outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
              />
            </div>

            {/* Web URL */}
            <div>
              <label className="block text-[11px] font-medium text-secondary mb-1.5">Web Dashboard URL</label>
              <input
                type="text"
                value={webUrl}
                onChange={(e) => setWebUrl(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-[12px] bg-surface border border-border text-primary outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                placeholder="http://localhost:3000"
              />
            </div>

            {/* Pairing Token */}
            <div>
              <label className="block text-[11px] font-medium text-secondary mb-1.5">Pairing Token</label>
              <input
                type="password"
                value={pairingToken}
                onChange={(e) => setPairingToken(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-[12px] bg-surface border border-border text-primary outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all font-mono"
                placeholder="Paste from CPHub Settings"
              />
            </div>

            {/* Custom TLX Hosts */}
            <div>
              <label className="block text-[11px] font-medium text-secondary mb-1.5">Custom TLX Hosts</label>
              <div className="space-y-1.5">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-[12px] bg-surface border border-border text-primary outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                  placeholder="Nama instance (opsional) — mis. COMPFEST CPC"
                />
                <input
                  type="text"
                  value={newHost}
                  onChange={(e) => setNewHost(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-[12px] bg-surface border border-border text-primary outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                  placeholder="cpc.compfest.id"
                />
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={newApiHost}
                    onChange={(e) => setNewApiHost(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addHost())}
                    className="flex-1 min-w-0 px-3 py-2 rounded-xl text-[12px] bg-surface border border-border text-primary outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                    placeholder="API host (opsional)"
                  />
                  <button
                    onClick={addHost}
                    className="px-3 py-2 rounded-xl text-[12px] font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors shrink-0"
                  >
                    +
                  </button>
                </div>
              </div>
              {customHosts.length > 0 && (
                <div className="flex flex-col gap-1.5 mt-2">
                  {customHosts.map((entry) => (
                    <div
                      key={entry.host}
                      className="flex items-center justify-between px-3 py-2 rounded-xl bg-surface border border-border"
                    >
                      <div className="min-w-0">
                        <span className="text-[11px] text-primary block truncate font-medium">
                          {entry.name || entry.host}
                        </span>
                        <span className="text-[10px] text-muted block truncate">
                          {entry.name ? entry.host : ""}
                          {entry.name && entry.apiHost ? " · " : ""}
                          {entry.apiHost ? `API: ${entry.apiHost}` : ""}
                        </span>
                      </div>
                      <button
                        onClick={() => removeHost(entry.host)}
                        className="text-muted hover:text-red transition-colors leading-none ml-2 shrink-0 text-[14px]"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-muted mt-1.5">Instance TLX open-source (Judgels) selain tlx.toki.id</p>
            </div>

            {/* Save Button */}
            <button
              onClick={saveSettings}
              className={`w-full py-2.5 rounded-xl text-[12px] font-semibold transition-all ${
                saved
                  ? "bg-green text-white"
                  : "bg-gradient-to-r from-blue-600 to-blue-500 text-white hover:from-blue-700 hover:to-blue-600 shadow-soft"
              }`}
            >
              {saved ? "✓ Saved" : "Save Settings"}
            </button>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-border text-center">
        <span className="text-[10px] text-muted">CPHub V4 · Competitive Programming Hub</span>
      </div>
    </div>
  );
}
