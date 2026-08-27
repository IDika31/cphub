import { useState, useEffect } from "react";
import { getSetting, setSetting } from "../shared/storage";
import { pingAPI, DEFAULT_API_URL, DEFAULT_WEB_URL } from "../shared/api";

export default function Options() {
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
  const [webUrl, setWebUrl] = useState(DEFAULT_WEB_URL);
  const [pairingToken, setPairingToken] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "testing" | "ok" | "error">("idle");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const url = await getSetting("apiUrl");
      const web = await getSetting("webUrl");
      const token = await getSetting("pairingToken");
      if (url) setApiUrl(url);
      if (web) setWebUrl(web);
      if (token) setPairingToken(token);
    })();
  }, []);

  async function save() {
    // Trailing slashes break every path concatenation downstream.
    const trim = (u: string) => u.trim().replace(/\/+$/, "");
    await setSetting("apiUrl", trim(apiUrl));
    await setSetting("webUrl", trim(webUrl));
    await setSetting("pairingToken", pairingToken.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#475569", marginBottom: 6 }}>
            Web Dashboard URL
          </label>
          <input
            type="text"
            value={webUrl}
            onChange={(e) => setWebUrl(e.target.value)}
            className={inputClass}
            placeholder="https://cphub.example.com"
          />
          <p style={{ fontSize: 11, color: "#64748b", margin: "6px 0 0" }}>
            Where Alt+C opens the editor. Point this at your CPHub deployment, not localhost,
            unless you run the dashboard on this machine.
          </p>
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#475569", marginBottom: 6 }}>
            Pairing Token
          </label>
          <input
            type="password"
            value={pairingToken}
            onChange={(e) => setPairingToken(e.target.value)}
            className={inputClass}
            placeholder="Paste from CPHub Settings — unique per account"
            style={{ fontFamily: "monospace" }}
          />
          <p style={{ fontSize: 11, color: "#64748b", margin: "6px 0 0" }}>
            Format <code>accountId.secret</code>. Without it every sync is refused with
            &ldquo;Missing X-Key-Id&rdquo;. Rotating it in CPHub Settings invalidates this one.
          </p>
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
            {saved ? "Saved ✓" : "Save Settings"}
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
