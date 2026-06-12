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

  return (
    <div style={{ maxWidth: 500, margin: "40px auto", fontFamily: "Inter,sans-serif" }}>
      <h1 style={{ fontSize: 20, marginBottom: 24 }}>CPHub Extension Settings</h1>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "block", fontSize: 13, marginBottom: 4 }}>API Base URL</label>
        <input
          type="text"
          value={apiUrl}
          onChange={(e) => setApiUrl(e.target.value)}
          style={{ width: "100%", padding: "8px 12px", fontSize: 14, borderRadius: 6, border: "1px solid #ccc" }}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "block", fontSize: 13, marginBottom: 4 }}>HMAC Secret</label>
        <input
          type="password"
          value={hmacSecret}
          onChange={(e) => setHmacSecret(e.target.value)}
          style={{ width: "100%", padding: "8px 12px", fontSize: 14, borderRadius: 6, border: "1px solid #ccc" }}
          placeholder="Paste from CPHub Settings"
        />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button onClick={save} style={{ padding: "8px 16px", background: "#8b5cf6", color: "white", border: "none", borderRadius: 6, cursor: "pointer" }}>
          Save
        </button>
        <button onClick={testConnection} style={{ padding: "8px 16px", border: "1px solid #ccc", borderRadius: 6, cursor: "pointer" }}>
          {connectionStatus === "testing" ? "Testing..." : "Test Connection"}
        </button>
      </div>

      {connectionStatus === "ok" && <p style={{ color: "#10b981" }}>✓ Connection OK</p>}
      {connectionStatus === "error" && <p style={{ color: "#ef4444" }}>✗ Connection failed</p>}
    </div>
  );
}
