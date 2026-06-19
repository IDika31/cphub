import { generateHMAC } from "./crypto";
import { getSetting } from "./storage";

const DEFAULT_API_URL = "http://localhost:3001";

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

export class HttpError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "HttpError";
  }
}

export async function syncToAPI(payload: SyncPayload): Promise<SyncResponse> {
  const apiUrl = await getApiUrl();
  const hmacSecret = await getSetting("hmacSecret");
  if (!hmacSecret) {
    throw new Error("HMAC secret not configured — open extension Settings tab and paste from CPHub /settings page");
  }

  const body = JSON.stringify(payload);
  const endpoint = payload.type === "problem" ? "/api/sync/problem" : "/api/sync/submission";

  let retries = 3;
  let lastError: Error | null = null;

  while (retries > 0) {
    // Generate fresh nonce + signature per retry
    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const signature = await generateHMAC(body, hmacSecret);

    try {
      const res = await fetch(`${apiUrl}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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
