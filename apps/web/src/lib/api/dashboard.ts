import { apiClient } from "./client";

export interface DashboardOverview {
  solved: number;
  attempted: number;
  streak: number;
  accuracy: number;
  cfHandle: string;
  cfRating: number;
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
