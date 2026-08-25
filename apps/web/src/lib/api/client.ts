// API base URL resolution:
// - NEXT_PUBLIC_API_URL (build-time) wins when set — use it for a dedicated
//   API origin (e.g. https://api.example.com).
// - Otherwise, in the browser: on localhost keep hitting the dev API
//   directly; on any other host fall back to same-origin — behind the
//   reverse proxy /api is routed to the backend, so no CORS is involved
//   and the same build works on any domain (http or https).
// - Server-side / no env: default to the local dev API.
function resolveApiBase(): string {
  const env = process.env.NEXT_PUBLIC_API_URL;

  // Server-side (SSR): no window — use the env or the local dev default.
  if (typeof window === "undefined") {
    return env || "http://localhost:3001";
  }

  const { hostname, origin } = window.location;
  const pageIsLocal = hostname === "localhost" || hostname === "127.0.0.1";

  if (env) {
    const envIsLocalhost = /localhost|127\.0\.0\.1/.test(env);
    // A localhost API URL only makes sense when the page itself is local.
    // If the page is served from a real domain but the build still carries a
    // stale localhost API URL, ignore it and use same-origin routing instead.
    if (!envIsLocalhost || pageIsLocal) return env;
    return origin;
  }

  return pageIsLocal ? "http://localhost:3001" : origin;
}

const API_BASE_URL = resolveApiBase();

// WebSocket base derived from the API base (http→ws, https→wss).
function wsBase(): string {
  return API_BASE_URL.replace(/^http/, "ws");
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("cphub_token");
}

interface RequestOptions extends RequestInit {
  token?: string;
}

export async function apiClient<T>(
  endpoint: string,
  options: RequestOptions = {},
): Promise<T> {
  const token = options.token || getToken();

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...options.headers as Record<string, string>,
  };

  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
    credentials: "include",
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((error as { error?: string }).error || `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export { API_BASE_URL, wsBase };
