import { generateHMAC } from "./crypto";
import { getSetting } from "./storage";

const DEFAULT_API_URL = "http://localhost:3001";
const DEFAULT_WEB_URL = "http://localhost:3000";

export interface SyncPayload {
  provider: "codeforces" | "tlx";
  type: "problem" | "submission" | "profile";
  url: string;
  data: Record<string, unknown>;
}

export interface SyncResponse {
  status: "ok" | "error";
  message?: string;
}

async function getApiUrl(): Promise<string> {
  const url = await getSetting("apiUrl");
  return url || DEFAULT_API_URL;
}

// The dashboard lives on a different origin from the API in most deployments,
// so "open this problem in CPHub" needs its own base. Trailing slashes are
// stripped because every caller concatenates a path onto it.
export async function getWebUrl(): Promise<string> {
  const url = await getSetting("webUrl");
  return (url || DEFAULT_WEB_URL).replace(/\/+$/, "");
}

export interface ExtensionKey {
  keyId: string;
  secret: string;
}

// CPHub Settings hands out one string: "<account id>.<secret>". Each account has
// its own secret, so pairing is per user and one leaked token is scoped to one
// account. Splitting it here keeps pairing to a single copy-paste.
export function parsePairingToken(token: string): ExtensionKey | null {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const keyId = token.slice(0, dot).trim();
  const secret = token.slice(dot + 1).trim();
  return keyId && secret ? { keyId, secret } : null;
}

async function getExtensionKey(): Promise<ExtensionKey | null> {
  const token = await getSetting("pairingToken");
  return token ? parsePairingToken(token) : null;
}

export class HttpError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "HttpError";
  }
}

export async function syncToAPI(payload: SyncPayload): Promise<SyncResponse> {
  const apiUrl = await getApiUrl();
  const key = await getExtensionKey();
  if (!key) {
    throw new Error("Extension not paired — copy the pairing token from CPHub Settings into the extension Settings tab");
  }

  const body = JSON.stringify(payload);
  const endpoint = payload.type === "problem" ? "/api/sync/problem" : "/api/sync/submission";
  let retries = 3;
  let lastError: Error | null = null;

  while (retries > 0) {
    // Generate fresh nonce + signature per retry
    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const signature = await generateHMAC(body, key.secret);

    try {
      const res = await fetch(`${apiUrl}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Key-Id": key.keyId,
          "X-HMAC-Signature": signature,
          "X-Nonce": nonce,
        },
        body,
      });

      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({}));
        const message = (errorBody as { error?: string }).error || `HTTP ${res.status}`;
        throw new HttpError(message, res.status);
      }

      return (await res.json()) as SyncResponse;
    } catch (err) {
      lastError = err as Error;
      // Don't retry client errors (4xx) — bad data won't succeed on retry
      if (err instanceof HttpError && err.status >= 400 && err.status < 500) {
        break;
      }
      retries--;
      if (retries > 0) {
        await new Promise((r) => setTimeout(r, 1000 * (3 - retries)));
      }
    }
  }

  throw lastError || new Error("Sync failed after retries");
}

export async function pingAPI(): Promise<{ status: string; latencyMs: number }> {
  const apiUrl = await getApiUrl();
  const start = performance.now();
  const res = await fetch(`${apiUrl}/api/health`);
  const end = performance.now();
  return {
    status: res.ok ? "ok" : "error",
    latencyMs: Math.round(end - start),
  };
}

/** Custom Judgels/TLX hosts the user added in the extension. Pushed to CPHub so
 *  each one gets its own Connections entry instead of being invisible to the
 *  dashboard — the list is authoritative, so removing a host here unlinks it. */
export async function pushCustomTLXHosts(
  hosts: Array<{ host: string; apiHost?: string; name?: string }>,
): Promise<void> {
  const key = await getExtensionKey();
  if (!key) return; // not paired yet — nothing to attribute the hosts to

  const apiUrl = await getApiUrl();
  const body = JSON.stringify({ hosts });
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const signature = await generateHMAC(body, key.secret);

  const res = await fetch(`${apiUrl}/api/sync/tlx-hosts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Key-Id": key.keyId,
      "X-HMAC-Signature": signature,
      "X-Nonce": nonce,
    },
    body,
  });
  if (!res.ok) {
    throw new HttpError(`Failed to register custom TLX hosts (HTTP ${res.status})`, res.status);
  }
}
