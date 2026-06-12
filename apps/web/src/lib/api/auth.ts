import { apiClient } from "./client";

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
}

export interface AuthResponse {
  user: { id: string; email: string; name: string; avatarUrl?: string };
  accessToken: string;
  refreshToken: string;
}

export async function login(payload: LoginPayload): Promise<AuthResponse> {
  return apiClient("/api/auth/login", { method: "POST", body: JSON.stringify(payload) });
}

export async function register(payload: RegisterPayload): Promise<AuthResponse> {
  return apiClient("/api/auth/register", { method: "POST", body: JSON.stringify(payload) });
}

export async function getMe(token: string): Promise<{ userId: string; email: string }> {
  return apiClient("/api/auth/me", { token });
}

export async function logout(): Promise<void> {
  return apiClient("/api/auth/logout", { method: "POST" });
}
