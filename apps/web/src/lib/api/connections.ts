import { apiClient } from "./client";

export interface LinkedAccount {
  id: string;
  provider: string;
  /** For tlx-custom this is the instance hostname. */
  handle: string;
  /** For tlx-custom this is the instance's API host, when the user set one. */
  providerUserId?: string;
  /** Account name on that instance (tlx-custom keeps the host in `handle`). */
  providerUsername?: string;
  /** Label the user gave a self-hosted instance in the extension. */
  displayName?: string;
  rating: number;
  maxRating: number;
  avatarUrl?: string;
  isConnected: boolean;
  linkedAt: string;
}

export async function fetchConnections(): Promise<{ data: LinkedAccount[] }> {
  return apiClient("/api/accounts");
}

export async function unlinkAccount(id: string): Promise<{ message: string }> {
  return apiClient(`/api/accounts/${id}`, { method: "DELETE" });
}

export async function linkTLX(
  username: string,
  password: string,
): Promise<{ message: string; handle: string }> {
  return apiClient("/api/accounts/tlx", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

/** Log into a self-hosted Judgels/TLX instance. Judgels serves every route from
 *  one configurable apiUrl, so the only thing that differs from official TLX is
 *  which host answers. */
export async function linkTLXCustom(
  host: string,
  username: string,
  password: string,
): Promise<{ message: string; host: string; apiBase: string; username: string }> {
  return apiClient("/api/accounts/tlx-custom", {
    method: "POST",
    body: JSON.stringify({ host, username, password }),
  });
}
