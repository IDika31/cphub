import { apiClient } from "./client";

export interface LinkedAccount {
  id: string;
  provider: string;
  handle: string;
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
