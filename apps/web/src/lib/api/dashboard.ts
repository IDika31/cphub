import { apiClient } from "./client";

export interface VerdictCount {
  verdict: string;
  count: number;
}

export interface LanguageCount {
  language: string;
  count: number;
}

export interface DifficultyBucket {
  bucket: string;
  total: number;
  solved: number;
  order: number;
}

/** One judge's slice of the dashboard. Every field is derived from synced rows,
 *  so TLX and Codeforces are described the same way. */
/** What the judge itself reports, counted per problem rather than per
 *  submission. Shown next to CPHub's own totals because the two legitimately
 *  differ: the submission feed we sync covers less history than TLX aggregates. */
export interface OfficialStats {
  score: number;
  problemsTried: number;
  problemsSolved: number;
  syncedAt?: string;
}

export interface ProviderStats {
  provider: string;
  handle: string;
  /** Account name on this judge — tlx-custom keeps its host in `handle`. */
  providerUsername?: string;
  /** Label the user gave a self-hosted instance in the extension. */
  displayName?: string;
  connected: boolean;
  rating: number;
  maxRating: number;
  submissions: number;
  accepted: number;
  solved: number;
  attempted: number;
  accuracy: number;
  solveRate: number;
  avgRuntime: number;
  library: number;
  firstActivity?: string;
  lastActivity?: string;
  verdicts: VerdictCount[];
  languages: LanguageCount[];
  difficulty: DifficultyBucket[];
  official?: OfficialStats;
}

export interface DashboardOverview {
  providers: ProviderStats[];
  totals: {
    submissions: number;
    accepted: number;
    solved: number;
    attempted: number;
    accuracy: number;
    streak: number;
    longestStreak: number;
  };
  library: { total: number; byProvider: Record<string, number> };
  localRuns: { total: number; verdicts: VerdictCount[] };
}

export interface ActivityDay {
  date: string;
  count: number;
  solved: number;
  byProvider: Record<string, number>;
  /** AC count per provider, so a per-provider view isn't coloured by another judge. */
  solvedByProvider?: Record<string, number>;
}

export interface SeriesPoint {
  label: string;
  value: number;
  date: number;
}

export interface TagStat {
  tag: string;
  total: number;
  failed: number;
  solved: number;
  passRate: number;
}

export async function fetchDashboardOverview(): Promise<DashboardOverview> {
  return apiClient("/api/dashboard/overview");
}

export async function fetchActivity(days = 365): Promise<{ data: ActivityDay[]; since: string; days: number }> {
  return apiClient(`/api/dashboard/activity?days=${days}`);
}

/** Codeforces reports a real rating; the TLX family has none, so each of those
 *  series is the running total of distinct problems solved. Keyed by provider —
 *  `codeforces`, `tlx`, every `tlx-custom` instance the user synced — plus
 *  `local`, which is Codeforces' own solve curve. */
export type ProgressSeries = Record<string, SeriesPoint[]>;

export async function fetchProgress(): Promise<ProgressSeries> {
  return apiClient("/api/dashboard/rating");
}

export async function fetchTagWeakness(provider?: string, limit = 12): Promise<{ data: TagStat[] }> {
  const qs = new URLSearchParams({ limit: String(limit) });
  if (provider) qs.set("provider", provider);
  return apiClient(`/api/dashboard/tag-weakness?${qs.toString()}`);
}

export async function syncCFSubmissions(): Promise<{
  status: string;
  problems: number;
  submissions: number;
  fetched: number;
  rating: number;
}> {
  return apiClient("/api/dashboard/sync-cf", { method: "POST" });
}

/** One entry per linked Judgels instance. The endpoint walks them all and answers 200
 *  as soon as any of them fetched, so `error` here is the only place a partial failure
 *  shows up — a self-hosted instance with an expired token otherwise stops advancing
 *  behind a green toast. Every instance failing comes back 424 instead. */
export interface TLXInstanceResult {
  provider: string;
  host: string;
  submissions?: number;
  fetched?: number;
  rating?: number;
  official?: { score: number; problemsTried: number; problemsSolved: number };
  error?: string;
}

export interface TLXSyncResult {
  status: string;
  submissions: number;
  fetched: number;
  rating?: number;
  official?: { score: number; problemsTried: number; problemsSolved: number };
  /** Absent only from an older API build; the current one always lists the instances. */
  instances?: TLXInstanceResult[];
}

export async function syncTLXSubmissions(): Promise<TLXSyncResult> {
  return apiClient("/api/dashboard/sync-tlx", { method: "POST" });
}
