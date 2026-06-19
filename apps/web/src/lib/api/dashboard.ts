import { apiClient } from "./client";

export interface ProviderStat {
  provider: string;
  problems: number;
  solved: number;
}

export interface DashboardOverview {
  solved: number;
  attempted: number;
  streak: number;
  accuracy: number;
  cfHandle: string;
  cfRating: number;
  byProvider?: ProviderStat[];
}

export async function fetchDashboardOverview(): Promise<DashboardOverview> {
  return apiClient("/api/dashboard/overview");
}

export async function fetchRatingHistory(): Promise<{ data: unknown[] }> {
  return apiClient("/api/dashboard/rating");
}

export async function fetchHeatmap(): Promise<{ data: unknown[] }> {
  return apiClient("/api/dashboard/heatmap");
}

export async function fetchTagWeakness(): Promise<{ data: unknown[] }> {
  return apiClient("/api/dashboard/tag-weakness");
}

export async function syncCFSubmissions(): Promise<{ status: string; problems: number; submissions: number }> {
  return apiClient("/api/dashboard/sync-cf", { method: "POST" });
}

export async function syncTLXSubmissions(): Promise<{ status: string; submissions: number }> {
  return apiClient("/api/dashboard/sync-tlx", { method: "POST" });
}
