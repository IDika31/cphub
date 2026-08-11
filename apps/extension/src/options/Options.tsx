import { useState, useEffect } from "react";
import { getSetting, setSetting } from "../shared/storage";
import { pingAPI } from "../shared/api";

export default function Options() {
  const [apiUrl, setApiUrl] = useState("http://localhost:3001");
  const [hmacSecret, setHmacSecret] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "testing" | "ok" | "error">("idle");

  useEffect(() => {
    (async () => {
      const url = await getSetting("apiUrl");
      const secret = await getSetting("hmacSecret");
      if (url) setApiUrl(url);
      if (secret) setHmacSecret(secret);
    })();
  }, []);

  async function save() {
    await setSetting("apiUrl", apiUrl);
    await setSetting("hmacSecret", hmacSecret);
    alert("Settings saved");
  }

  async function testConnection() {
    setConnectionStatus("testing");
    try {
      const res = await pingAPI();
      setConnectionStatus(res.status === "ok" ? "ok" : "error");
    } catch {
      setConnectionStatus("error");
    }
  }

  const inputClass =
    "w-full px-4 py-2.5 rounded-xl text-[14px] bg-[#f8fafc] border border-[#e2e8f0] text-[#0f172a] outline-none focus:border-[#3b82f6] focus:ring-2 focus:ring-[#dbeafe] transition-all";

  return (
    <div style={{ maxWidth: 520, margin: "48px auto", fontFamily: "Inter, system-ui, sans-serif", padding: "0 24px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            background: "linear-gradient(135deg, #2563eb, #3b82f6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            fontWeight: 700,
            fontSize: 16,
          }}
        >
          C
        </div>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: "#0f172a", margin: 0 }}>CPHub Settings</h1>
          <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>Extension Configuration</p>
        </div>
      </div>

      <div
        style={{
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: 16,
          padding: 24,
          boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.06), 0 2px 8px -2px rgb(0 0 0 / 0.06)",
        }}
      >
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#475569", marginBottom: 6 }}>
            API Base URL
          </label>
          <input
            type="text"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            className={inputClass}
          />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#475569", marginBottom: 6 }}>
            HMAC Secret
          </label>
          <input
            type="password"
            value={hmacSecret}
            onChange={(e) => setHmacSecret(e.target.value)}
            className={inputClass}
            placeholder="Paste from CPHub Settings"
            style={{ fontFamily: "monospace" }}
          />
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={save}
            style={{
              padding: "10px 20px",
              background: "linear-gradient(135deg, #2563eb, #3b82f6)",
              color: "white",
              border: "none",
              borderRadius: 12,
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 13,
              fontFamily: "inherit",
            }}
          >
            Save Settings
          </button>
          <button
            onClick={testConnection}
            style={{
              padding: "10px 20px",
              border: "1px solid #e2e8f0",
              background: "#f8fafc",
              borderRadius: 12,
              cursor: "pointer",
              fontWeight: 500,
              fontSize: 13,
              color: "#475569",
              fontFamily: "inherit",
            }}
          >
            {connectionStatus === "testing" ? "Testing..." : "Test Connection"}
          </button>
        </div>
      </div>

      {connectionStatus === "ok" && (
        <div
          style={{
            marginTop: 16,
            padding: "12px 16px",
            background: "#dcfce7",
            border: "1px solid #bbf7d0",
            borderRadius: 12,
            color: "#16a34a",
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          ✓ Connection successful
        </div>
      )}
      {connectionStatus === "error" && (
        <div
          style={{
            marginTop: 16,
            padding: "12px 16px",
            background: "#fee2e2",
            border: "1px solid #fecaca",
            borderRadius: 12,
            color: "#dc2626",
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          ✗ Connection failed
        </div>
      )}
    </div>
  );
}
