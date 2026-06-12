import { useState, useEffect } from "react";
import { pingAPI } from "../shared/api";
import { getSyncedCount } from "../shared/storage";
import { MESSAGE_TYPES } from "../shared/messages";

type Tab = "sync" | "status" | "settings";

const styles = {
  container: {
    display: "flex",
    flexDirection: "column" as const,
    minHeight: 400,
    background: "#0f0f10",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 12px",
    height: 40,
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    background: "#18181b",
  },
  logo: {
    fontSize: 13,
    fontWeight: 600,
    color: "#8b5cf6",
  },
  statusDot: (ok: boolean) => ({
    fontSize: 10,
    color: ok ? "#10b981" : "#ef4444",
  }),
  tabBar: {
    display: "flex",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    background: "#18181b",
  },
  tab: (active: boolean) => ({
    flex: 1,
    height: 32,
    border: "none",
    borderBottom: active ? "2px solid #8b5cf6" : "2px solid transparent",
    background: "transparent",
    color: active ? "#8b5cf6" : "#71717a",
    fontSize: 11,
    fontWeight: 500,
    cursor: "pointer",
  }),
  content: {
    flex: 1,
    padding: 12,
  },
  button: (primary?: boolean) => ({
    width: "100%",
    padding: "8px 0",
    borderRadius: 6,
    border: "none",
    background: primary ? "#8b5cf6" : "#1f1f23",
    color: primary ? "#fff" : "#e4e4e7",
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
    borderBottom: primary ? "none" : "1px solid rgba(255,255,255,0.08)",
  }),
  input: {
    width: "100%",
    padding: "6px 8px",
    borderRadius: 4,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "#1f1f23",
    color: "#e4e4e7",
    fontSize: 12,
    outline: "none",
  },
  label: {
    display: "block" as const,
    fontSize: 11,
    color: "#71717a",
    marginBottom: 4,
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 12,
  },
} as const;

export default function App() {
  const [tab, setTab] = useState<Tab>("sync");
  const [apiOk, setApiOk] = useState(false);
  const [latency, setLatency] = useState(0);
  const [syncedCount, setSyncedCount] = useState(0);

  async function loadStatus() {
    try {
      const res = await pingAPI();
      setApiOk(res.status === "ok");
      setLatency(res.latencyMs);
      const count = await getSyncedCount();
      setSyncedCount(count);
    } catch {
      setApiOk(false);
    }
  }

  useEffect(() => { loadStatus(); }, []);

  async function handleSync() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: MESSAGE_TYPES.SYNC_PROBLEM });
      window.close();
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.logo}>CPHub</span>
        <span style={styles.statusDot(apiOk)}>{apiOk ? "● Connected" : "● Offline"}</span>
      </div>

      <div style={styles.tabBar}>
        {(["sync", "status", "settings"] as Tab[]).map((t) => (
          <button key={t} style={styles.tab(tab === t)} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div style={styles.content}>
        {tab === "sync" && (
          <div>
            <button style={styles.button(true)} onClick={handleSync}>Sync This Problem</button>
            <div style={{ marginTop: 12, ...styles.row, color: "#71717a", fontSize: 11 }}>
              {syncedCount > 0 ? `${syncedCount} problems synced` : "No problems synced yet"}
            </div>
          </div>
        )}

        {tab === "status" && (
          <div>
            <div style={{ ...styles.row, marginBottom: 8 }}>
              <span style={{ color: "#71717a" }}>API</span>
              <span style={{ color: apiOk ? "#10b981" : "#ef4444" }}>{apiOk ? `${latency}ms` : "Offline"}</span>
            </div>
            <div style={{ ...styles.row, marginBottom: 8 }}>
              <span style={{ color: "#71717a" }}>Extension</span>
              <span style={{ color: "#52525b" }}>v4.0.0</span>
            </div>
            <button onClick={loadStatus} style={{ ...styles.button(), marginTop: 8 }}>Refresh</button>
          </div>
        )}

        {tab === "settings" && (
          <div>
            <div style={{ marginBottom: 12 }}>
              <label style={styles.label}>API URL</label>
              <input type="text" defaultValue="http://localhost:3001" style={styles.input} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={styles.label}>HMAC Secret</label>
              <input type="password" style={styles.input} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
