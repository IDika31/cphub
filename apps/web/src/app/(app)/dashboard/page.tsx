"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import Topbar from "@/components/shell/topbar";
import Badge from "@/components/ui/badge";
import Button from "@/components/ui/button";
import Skeleton from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { Panel, StatCard, EmptyPanel, BarList, VERDICT_COLORS, VERDICT_LABELS } from "@/components/dashboard/panels";
import ActivityHeatmap from "@/components/dashboard/activity-heatmap";
import ProgressChart from "@/components/dashboard/progress-chart";
import {
  fetchDashboardOverview, fetchActivity, fetchProgress, fetchTagWeakness, fetchRecommendations,
  syncCFSubmissions, syncTLXSubmissions,
  type DashboardOverview, type ProviderStats, type ActivityDay, type SeriesPoint, type TagStat,
  type ProgressSeries, type Recommendation, type RecommendationBasis,
} from "@/lib/api/dashboard";
import { RecommendPanel } from "@/components/dashboard/recommend-panel";
import { providerLabel, accountIdentity, isTLXFamily } from "@/lib/providers";
import {
  RefreshCw, CheckCircle2, Send, Target, Trophy, Flame, Link2, ArrowRight, Library, Percent,
} from "lucide-react";

// Colour only — names come from lib/providers, so Connections, Submissions and
// this page cannot drift apart. There used to be a second providerLabel here that
// ignored the handle, which is why a self-hosted instance read as the generic
// "TLX custom" instead of `tlx-<host>`.
const PROVIDER_COLORS: Record<string, string> = {
  codeforces: "#60a5fa",
  tlx: "#fbbf24",
  "tlx-custom": "#a78bfa",
};

function providerColor(p: string) {
  return PROVIDER_COLORS[p] ?? "#a78bfa";
}
function pct(n: number) {
  return `${n.toFixed(n >= 10 ? 0 : 1)}%`;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [activity, setActivity] = useState<ActivityDay[]>([]);
  const [progress, setProgress] = useState<ProgressSeries>({});
  const [tags, setTags] = useState<TagStat[]>([]);
  const [tagsLoading, setTagsLoading] = useState(true);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [recommendBasis, setRecommendBasis] = useState<RecommendationBasis | undefined>();
  const [recommendLoading, setRecommendLoading] = useState(true);
  const [recommendError, setRecommendError] = useState("");
  // Bumped when the overview finishes, so panels that depend on the same data — the
  // recommender reads the solves a sync just wrote — reload with it instead of each
  // keeping its own idea of when the numbers last moved.
  const [loadedAt, setLoadedAt] = useState(0);
  const [scope, setScope] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [syncing, setSyncing] = useState<"" | "cf" | "tlx">("");
  const { addToast } = useToast();

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    const [overview, act, prog] = await Promise.all([
      fetchDashboardOverview().catch((err: unknown) => {
        setLoadError((err as Error).message || "Gagal memuat dashboard");
        return null;
      }),
      fetchActivity(365).catch(() => ({ data: [] as ActivityDay[], since: "", days: 0 })),
      fetchProgress().catch(() => ({}) as ProgressSeries),
    ]);
    // A failed overview means the API is unreachable, not that the account is
    // empty, so the last good snapshot stays on screen and the banner below says
    // what happened. Overwriting with null used to zero every number and claim no
    // judge was connected — the same picture a brand-new account gets.
    if (overview) setData(overview);
    setActivity(act.data);
    setProgress(prog);
    setLoading(false);
    setLoadedAt(Date.now());
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Tag stats are scoped to the selected provider, so switching tabs refetches
  // only that one panel instead of the whole dashboard. It needs its own loading
  // flag and cancel guard: the page-level `loading` is already false by then, so
  // otherwise the previous judge's pass rates stay painted under the new tab, and
  // a slow response for a tab the user left could land last and win.
  useEffect(() => {
    let cancelled = false;
    setTagsLoading(true);
    fetchTagWeakness(scope === "all" ? undefined : scope, 12)
      .then((res) => { if (!cancelled) setTags(res.data); })
      .catch(() => { if (!cancelled) setTags([]); })
      .finally(() => { if (!cancelled) setTagsLoading(false); });
    return () => { cancelled = true; };
  }, [scope]);

  // Recommendations are Codeforces-only and read the whole history, so they do not
  // follow the provider tabs — the same list is the answer whichever tab is open.
  // Reloaded when the overview reloads (a sync may have added the solves that change
  // the picks), which is what loadedAt tracks.
  useEffect(() => {
    let cancelled = false;
    setRecommendLoading(true);
    setRecommendError("");
    fetchRecommendations(8)
      .then((res) => {
        if (cancelled) return;
        setRecommendations(res.data);
        setRecommendBasis(res.basis);
      })
      .catch((err: unknown) => {
        if (!cancelled) setRecommendError((err as Error).message || "Gagal memuat rekomendasi");
      })
      .finally(() => { if (!cancelled) setRecommendLoading(false); });
    return () => { cancelled = true; };
  }, [loadedAt]);

  const providers = data?.providers ?? [];
  const selected = useMemo(
    () => (scope === "all" ? null : providers.find((p) => p.provider === scope) ?? null),
    [providers, scope],
  );
  const cf = providers.find((p) => p.provider === "codeforces");
  // Sync TLX pulls every connected Judgels instance, official or self-hosted, so
  // the button follows the whole family — it used to key off the official account
  // alone and stayed disabled for someone who only had a custom instance.
  const tlxConnected = providers.filter((p) => isTLXFamily(p.provider) && p.connected);

  const scopedActivity = useMemo(() => {
    if (scope === "all") return activity;
    return activity
      .map((d) => {
        const count = d.byProvider[scope] ?? 0;
        // `solved` on the raw day is every provider's AC count, so it cannot be
        // carried into a scoped view — it would credit this judge with another
        // judge's ACs. The API breaks it down per provider for exactly this, and it
        // leaves out providers that had no AC that day, so a missing key means
        // "none here"; only a missing map (an older API build) falls back.
        const solved = d.solvedByProvider ? (d.solvedByProvider[scope] ?? 0) : Math.min(d.solved, count);
        return { ...d, count, solved, byProvider: { [scope]: count } };
      })
      .filter((d) => d.count > 0);
  }, [activity, scope]);

  // How long a provider's submissions may go unsynced before opening the dashboard
  // refreshes them. Half an hour is the useful side of the trade: a contest's verdicts
  // land within minutes, and nobody needs the page to poll a judge every visit.
  const AUTO_SYNC_AFTER_MS = 30 * 60 * 1000;

  // Automatic, once per provider per window, in place of the buttons that used to sit in
  // the topbar. The buttons were the wrong shape for the job: pressing them was the only
  // way the dashboard ever became current, so the numbers were stale exactly when nobody
  // remembered to press.
  //
  // Gated in localStorage rather than on the server: the sync endpoints are idempotent,
  // so the worst case of two browsers each firing once is two identical fetches, and
  // keeping it client-side means no schema and no scheduler.
  useEffect(() => {
    if (loading || syncing !== "") return;
    const due = (kind: "cf" | "tlx") => {
      try {
        const last = Number(localStorage.getItem(`cphub_last_sync_${kind}`) ?? 0);
        return !Number.isFinite(last) || Date.now() - last > AUTO_SYNC_AFTER_MS;
      } catch {
        // Private mode, or storage disabled: sync once per page load rather than never.
        return true;
      }
    };
    const kind: "cf" | "tlx" | null = cf?.connected && due("cf")
      ? "cf"
      : tlxConnected.length > 0 && due("tlx")
        ? "tlx"
        : null;
    if (!kind) return;
    try {
      // Stamped before the call, not after: a sync that fails must not retry on every
      // render for the next half hour.
      localStorage.setItem(`cphub_last_sync_${kind}`, String(Date.now()));
    } catch {
      /* nothing to remember it with */
    }
    // One provider per pass. The effect runs again when `syncing` clears, so the second
    // provider follows without both hitting the API at once on a slow connection.
    void runSync(kind, { silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, syncing, cf?.connected, tlxConnected.length]);

  async function runSync(kind: "cf" | "tlx", opts: { silent?: boolean } = {}) {
    setSyncing(kind);
    try {
      if (kind === "cf") {
        const res = await syncCFSubmissions();
        // An automatic run says nothing when it worked: a toast on every dashboard open
        // is noise about something the user did not ask for. Failures still speak — an
        // expired Codeforces session is theirs to fix.
        if (!opts.silent) {
          addToast("success", `Codeforces: ${res.submissions} submission baru, ${res.problems} problem baru (dari ${res.fetched} diambil)`);
        }
      } else {
        const res = await syncTLXSubmissions();
        const off = res.official
          ? ` · TLX: ${res.official.problemsSolved}/${res.official.problemsTried} problem, ${res.official.score} pts`
          : "";
        const base = `TLX: ${res.submissions} submission baru (dari ${res.fetched} diambil)${off}`;
        // Sync TLX walks every linked instance and answers 200 as soon as one of
        // them fetched, listing the failures in `instances[]`. Reading them is the
        // only way a self-hosted instance with an expired token gets reported —
        // otherwise it silently stops advancing behind a green toast.
        const failed = (res.instances ?? []).filter((i) => i.error);
        if (opts.silent && failed.length === 0) {
          // Same rule as above: silence on success.
        } else if (failed.length > 0) {
          // "info", not "error": the counts above are real, the failure is partial.
          // Every instance failing comes back 424 and lands in the catch below.
          addToast("info", `${base} · gagal: ${failed.map((f) => `${f.host} (${f.error})`).join(", ")}`);
        } else {
          addToast("success", base);
        }
      }
      await loadData();
    } catch (err) {
      addToast("error", `Sync ${kind === "cf" ? "Codeforces" : "TLX"} gagal: ${(err as Error).message || "cek koneksi API"}`);
    }
    setSyncing("");
  }

  const anyConnected = providers.some((p) => p.connected);

  return (
    <>
      <Topbar title="Dashboard">
        {/* One chip per connected judge, all the same shape. It used to be an
            untitled "IDika" badge for CF, "TLX TOKI IDika" for TLX and a bare
            hostname for a custom instance — three different formats in a row,
            with the account name repeated once and missing once. */}
        {providers.filter((p) => p.connected).map((p) => (
          <ProviderChip key={p.provider} stats={p} />
        ))}
        {/* No Sync buttons. Nobody could know when to press them, and the answer was
            always "whenever you happen to think of it" — see the auto-sync effect
            above. This says what is happening instead. */}
        {syncing !== "" && (
          <span className="flex items-center gap-1.5 text-[11px] text-[#a1a1aa]" aria-live="polite">
            <RefreshCw className="w-3 h-3 animate-spin" aria-hidden="true" />
            {`Menyegarkan ${syncing === "cf" ? "Codeforces" : "TLX"}...`}
          </span>
        )}
      </Topbar>

      <div className="flex-1 overflow-y-auto p-[14px] space-y-4">
        {loadError && (
          <div role="alert" className="flex items-center gap-3 text-[12px] text-[#f87171]">
            <span>Gagal memuat dashboard: {loadError}</span>
            <Button variant="default" onClick={() => loadData()} disabled={loading}>Coba lagi</Button>
          </div>
        )}

        {/* Gated on `data` as well, so a failed load can never claim the judges are
            unlinked — that is the harmful reading, not the empty numbers. */}
        {!loading && data && !anyConnected && (
          <Link
            href="/connections"
            className="group flex items-center gap-3 bg-[rgba(139,92,246,0.08)] border border-[rgba(139,92,246,0.25)] rounded-[8px] p-[14px] hover:bg-[rgba(139,92,246,0.12)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]"
          >
            <div className="w-9 h-9 rounded-[8px] bg-[rgba(139,92,246,0.15)] text-[#a78bfa] flex items-center justify-center flex-shrink-0">
              <Link2 className="w-4 h-4" aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold text-[#e4e4e7]">Hubungkan Codeforces atau TLX</div>
              <div className="text-[12px] text-[#a1a1aa]">Dashboard mengisi grafik dan analitik dari submission yang sudah tersync.</div>
            </div>
            <ArrowRight className="w-4 h-4 text-[#a78bfa] group-hover:translate-x-0.5 transition-transform" aria-hidden="true" />
          </Link>
        )}

        {/* Above the tabs on purpose: the picks are not a per-provider statistic, they
            are the one thing on this page that tells the user what to do next. */}
        <RecommendPanel
          data={recommendations}
          basis={recommendBasis}
          loading={recommendLoading}
          error={recommendError}
        />

        <ScopeTabs
          scope={scope}
          onChange={setScope}
          providers={providers}
          loading={loading}
        />

        {/* The tabs above own this region, so it has to be the panel they point at —
            a role="tab" with no tabpanel announces a pattern that isn't there.
            `scope` can still name a provider that dropped out of the list, which
            would leave aria-labelledby on a missing id, hence the fallback. */}
        <div
          id="dashboard-scope-panel"
          role="tabpanel"
          aria-labelledby={`scope-tab-${providers.some((p) => p.provider === scope) ? scope : "all"}`}
          className="space-y-4"
        >
          {scope === "all" ? (
            <AllProvidersView
              data={data}
              providers={providers}
              loading={loading}
              activity={scopedActivity}
              progress={progress}
              tags={tags}
              tagsLoading={tagsLoading}
            />
          ) : selected ? (
            <SingleProviderView
              stats={selected}
              loading={loading}
              activity={scopedActivity}
              series={scope === "codeforces" ? (progress.codeforces ?? []) : (progress[scope] ?? [])}
              solveSeries={progress[scope === "codeforces" ? "local" : scope] ?? []}
              tags={tags}
              tagsLoading={tagsLoading}
            />
          ) : (
            <Panel title={providerLabel(scope)}>
              <EmptyPanel message="Provider ini belum punya data." />
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}

function ProviderChip({ stats }: { stats: ProviderStats }) {
  const label = providerLabel(stats.provider, stats.handle, stats.displayName);
  // Only worth its own slot when the name doesn't already contain it — otherwise
  // a custom instance would print its host twice.
  const handle = accountIdentity(label, stats.handle, stats.providerUsername);
  return (
    <Badge variant="time" className="gap-1.5">
      <span
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ background: providerColor(stats.provider) }}
        aria-hidden="true"
      />
      <span className="text-[#e4e4e7]">{label}</span>
      {handle && <span className="text-[#a1a1aa] truncate max-w-[120px]">{handle}</span>}
      {stats.rating > 0 && (
        <span className="tabular-nums text-[#a78bfa]" title={stats.maxRating > stats.rating ? `max ${stats.maxRating}` : undefined}>
          {stats.rating}
        </span>
      )}
    </Badge>
  );
}

function ScopeTabs({
  scope, onChange, providers, loading,
}: {
  scope: string;
  onChange: (s: string) => void;
  providers: ProviderStats[];
  loading: boolean;
}) {
  const tabs = [{ value: "all", label: "Semua", count: providers.reduce((a, p) => a + p.submissions, 0) }].concat(
    providers.map((p) => ({ value: p.provider, label: providerLabel(p.provider, p.handle, p.displayName), count: p.submissions })),
  );
  return (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter provider">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          id={`scope-tab-${t.value}`}
          aria-selected={scope === t.value}
          aria-controls="dashboard-scope-panel"
          onClick={() => onChange(t.value)}
          className={`px-[12px] py-[5px] rounded-full text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b] ${
            scope === t.value
              ? "bg-[#7c3aed] text-white"
              : "bg-[#1f1f23] text-[#a1a1aa] hover:text-[#e4e4e7] border border-[rgba(255,255,255,0.08)]"
          }`}
        >
          {t.label}
          {!loading && (
            <span className={`ml-1.5 tabular-nums ${scope === t.value ? "text-white/70" : "text-[#a1a1aa]"}`}>
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function AllProvidersView({
  data, providers, loading, activity, progress, tags, tagsLoading,
}: {
  data: DashboardOverview | null;
  providers: ProviderStats[];
  loading: boolean;
  activity: ActivityDay[];
  progress: ProgressSeries;
  tags: TagStat[];
  tagsLoading: boolean;
}) {
  const t = data?.totals;
  const withData = providers.filter((p) => p.submissions > 0 || p.connected);
  const cfRating = progress.codeforces ?? [];
  // Every TLX-family instance charts its own solve curve; "local" is Codeforces'.
  const solveCurves = Object.entries(progress)
    .filter(([key, pts]) => key !== "codeforces" && pts.length > 1)
    .sort((a, b) => b[1].length - a[1].length);
  // Named from the linked account, not from the key alone: bare providerLabel
  // prints the generic "TLX Custom" for a self-hosted instance instead of the name
  // its owner gave it.
  const curveLabel = (key: string) => {
    const p = key === "local" ? "codeforces" : key;
    const s = providers.find((x) => x.provider === p);
    return providerLabel(p, s?.handle, s?.displayName);
  };

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* "—" whenever the overview isn't there: a zero here is a claim about the
            account, and a failed fetch has nothing to claim. Accuracy also needs a
            submission before a percentage means anything — 0 submissions is "—",
            not a 0.0% success rate, which is how ProviderCard already reads it. */}
        <StatCard
          label="Problem Solved" loading={loading} accent="#34d399"
          value={t ? String(t.solved) : "—"}
          sub={`${t?.attempted ?? 0} dicoba · semua provider`}
          icon={<CheckCircle2 className="w-3.5 h-3.5" />}
        />
        <StatCard
          label="Submissions" loading={loading} accent="#60a5fa"
          value={t ? String(t.submissions) : "—"}
          sub={`${t?.accepted ?? 0} accepted`}
          icon={<Send className="w-3.5 h-3.5" />}
        />
        <StatCard
          label="Accuracy" loading={loading} accent="#fbbf24"
          value={t?.submissions ? pct(t.accuracy) : "—"}
          sub="AC / total submission"
          icon={<Percent className="w-3.5 h-3.5" />}
        />
        <StatCard
          label="Streak" loading={loading} accent="#fb923c"
          value={t ? `${t.streak} hari` : "—"}
          sub={`terpanjang ${t?.longestStreak ?? 0} hari`}
          icon={<Flame className="w-3.5 h-3.5" />}
        />
      </div>

      <Panel
        title="Aktivitas"
        subtitle="Submission per hari, 26 minggu terakhir, semua provider digabung"
      >
        {loading ? <Skeleton className="h-[130px] w-full" /> : <ActivityHeatmap days={activity} weeks={26} />}
      </Panel>

      <Panel title="Perbandingan Provider" subtitle="Angka per judge, dihitung dari submission yang tersync">
        {loading ? (
          <Skeleton className="h-[120px] w-full" />
        ) : withData.length === 0 ? (
          data ? (
            <EmptyPanel
              message="Belum ada provider tersync."
              hint={<Link href="/connections" className="text-[12px] text-[#a78bfa] hover:underline">Ke Connections →</Link>}
            />
          ) : (
            // No overview at all means the fetch failed, so nothing is known about
            // the linked judges — saying "belum ada" would be inventing an answer.
            <EmptyPanel message="Data provider gagal dimuat." />
          )
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {withData.map((p) => <ProviderCard key={p.provider} stats={p} />)}
          </div>
        )}
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Panel title="Rating Codeforces" subtitle={cfRating.length ? `${cfRating.length} kontes` : "Perlu akun CF terhubung"}>
          {loading ? (
            <Skeleton className="h-[200px] w-full" />
          ) : cfRating.length > 1 ? (
            <ProgressChart id="cfRating" points={cfRating} color="#60a5fa" valueName="Rating" />
          ) : (
            <EmptyPanel message={cfRating.length === 1 ? "Baru satu kontes — grafik butuh minimal dua titik." : "Belum ada riwayat kontes."} />
          )}
        </Panel>

        <Panel
          title="Problem Terpecahkan (kumulatif)"
          subtitle={`Problem unik yang AC${solveCurves.some(([k]) => isTLXFamily(k)) ? " — TLX tidak mengekspos riwayat rating per kontes" : ""}`}
        >
          {loading ? (
            <Skeleton className="h-[200px] w-full" />
          ) : solveCurves.length > 0 ? (
            // One chart per judge, each with its name above it. Drawing only the
            // longest curve dropped every other judge's progress and left the line
            // identified by colour alone — and since "local" is usually the longest,
            // that unnamed line was often Codeforces under a TLX-flavoured subtitle.
            <div className="space-y-3">
              {solveCurves.map(([key, pts]) => {
                const color = providerColor(key === "local" ? "codeforces" : key);
                return (
                  <div key={key}>
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: color }}
                        aria-hidden="true"
                      />
                      <span className="text-[11px] text-[#a1a1aa] truncate">{curveLabel(key)}</span>
                    </div>
                    <ProgressChart
                      id={`solve-${key}`}
                      points={pts}
                      color={color}
                      valueName="Solved"
                      height={solveCurves.length > 1 ? 140 : 200}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyPanel message="Belum cukup data solve untuk digambar." />
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <TagPanel tags={tags} loading={tagsLoading} />
        <LocalRunsPanel data={data} loading={loading} />
      </div>
    </>
  );
}

function ProviderCard({ stats }: { stats: ProviderStats }) {
  const color = providerColor(stats.provider);
  const label = providerLabel(stats.provider, stats.handle, stats.displayName);
  const identity = accountIdentity(label, stats.handle, stats.providerUsername);
  const rows: Array<[string, string]> = [
    ["Solved", `${stats.solved} / ${stats.attempted}`],
    ["Submission", String(stats.submissions)],
    ["Accuracy", stats.submissions ? pct(stats.accuracy) : "—"],
    ["Solve rate", stats.attempted ? pct(stats.solveRate) : "—"],
  ];
  if (stats.rating > 0) rows.push(["Rating", `${stats.rating}${stats.maxRating > stats.rating ? ` (max ${stats.maxRating})` : ""}`]);
  if (stats.avgRuntime > 0) rows.push(["Avg runtime", `${stats.avgRuntime}ms`]);
  rows.push(["Library", `${stats.library} problem`]);
  if (stats.official) {
    rows.push([`Solved (${label})`, `${stats.official.problemsSolved} / ${stats.official.problemsTried}`]);
    if (stats.official.score > 0) rows.push(["Poin", stats.official.score.toLocaleString("id-ID")]);
  }
  if (stats.lastActivity) {
    rows.push(["Terakhir", new Date(stats.lastActivity).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })]);
  }

  return (
    <div className="bg-[#1f1f23] border border-[rgba(255,255,255,0.06)] rounded-[6px] p-[14px]">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: stats.connected ? color : "#71717a" }} />
        <span className="text-[13px] font-semibold text-[#e4e4e7]">{label}</span>
        {/* A self-hosted instance is named by its host, so repeating it beside
            the label would just print the same string twice. */}
        {identity ? (
          <span className="text-[11px] text-[#a1a1aa] truncate">{identity}</span>
        ) : !stats.handle ? (
          <span className="text-[11px] text-[#a1a1aa]">belum terhubung</span>
        ) : null}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-2 min-w-0">
            <dt className="text-[11px] text-[#a1a1aa] truncate">{k}</dt>
            <dd className="text-[12px] font-medium text-[#e4e4e7] tabular-nums whitespace-nowrap">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function VerdictPanel({ stats }: { stats: ProviderStats }) {
  const total = stats.verdicts.reduce((a, v) => a + v.count, 0);
  return (
    <Panel title="Distribusi Verdict" subtitle={`${total} submission${stats.provider === "tlx" ? " · kode TLX dinormalkan" : ""}`}>
      {total === 0 ? (
        <EmptyPanel message="Belum ada submission." />
      ) : (
        <BarList
          total={total}
          rows={stats.verdicts.map((v) => ({
            key: v.verdict,
            label: VERDICT_LABELS[v.verdict] ?? v.verdict,
            value: v.count,
            color: VERDICT_COLORS[v.verdict] ?? "#71717a",
          }))}
        />
      )}
    </Panel>
  );
}

function LanguagePanel({ stats }: { stats: ProviderStats }) {
  const total = stats.languages.reduce((a, l) => a + l.count, 0);
  return (
    <Panel title="Bahasa" subtitle={total ? `${stats.languages.length} teratas` : undefined}>
      {total === 0 ? (
        <EmptyPanel message="Belum ada data bahasa." />
      ) : (
        <BarList
          total={total}
          rows={stats.languages.map((l, i) => ({
            key: l.language,
            label: l.language,
            value: l.count,
            color: ["#a78bfa", "#60a5fa", "#34d399", "#fbbf24", "#fb923c", "#f472b6", "#71717a"][i] ?? "#71717a",
          }))}
        />
      )}
    </Panel>
  );
}

function DifficultyPanel({ stats }: { stats: ProviderStats }) {
  const rated = stats.difficulty.filter((d) => d.total > 0);
  const total = rated.reduce((a, d) => a + d.total, 0);
  return (
    <Panel
      title="Sebaran Difficulty"
      subtitle={total ? "Dihitung per problem, bukan per submission" : undefined}
    >
      {total === 0 ? (
        <EmptyPanel message="Difficulty belum tersedia — sync problem dulu." />
      ) : (
        <BarList
          total={total}
          rows={rated.map((d) => ({
            key: d.bucket,
            label: d.bucket,
            value: d.total,
            color: d.solved === d.total ? "#34d399" : d.solved > 0 ? "#fbbf24" : "#f87171",
          }))}
        />
      )}
      {total > 0 && (
        <p className="text-[11px] text-[#a1a1aa] mt-3">
          Hijau = semua solved, kuning = sebagian, merah = belum ada yang solved.
        </p>
      )}
    </Panel>
  );
}

function TagPanel({ tags, loading }: { tags: TagStat[]; loading: boolean }) {
  return (
    <Panel
      title="Tag Weakness"
      subtitle="Pass rate per tag, dihitung per problem unik"
      action={
        !loading && tags.length > 0 ? (
          <div className="flex items-center gap-3 text-[10px] text-[#a1a1aa] flex-shrink-0">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#f87171]" />&lt;40%</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#fbbf24]" />&lt;70%</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#34d399]" />≥70%</span>
          </div>
        ) : undefined
      }
    >
      {loading ? (
        <Skeleton className="h-[140px] w-full" />
      ) : tags.length === 0 ? (
        <EmptyPanel message="Belum ada tag untuk dianalisis — sync problem yang punya tag (Codeforces)." />
      ) : (
        <ul className="space-y-2">
          {tags.map((t) => {
            const color = t.passRate < 40 ? "#f87171" : t.passRate < 70 ? "#fbbf24" : "#34d399";
            return (
              <li key={t.tag} className="flex items-center gap-3">
                <span className="text-[12px] text-[#e4e4e7] w-[110px] truncate" title={t.tag}>{t.tag}</span>
                <div className="flex-1 h-[8px] bg-[#1f1f23] rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${t.passRate}%`, background: color }} />
                </div>
                <span className="text-[11px] font-medium w-[42px] text-right tabular-nums" style={{ color }}>
                  {Math.round(t.passRate)}%
                </span>
                <span className="text-[11px] text-[#a1a1aa] w-[52px] text-right tabular-nums" title="solved / dicoba">
                  {t.solved}/{t.total}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function LocalRunsPanel({ data, loading }: { data: DashboardOverview | null; loading: boolean }) {
  const runs = data?.localRuns;
  const total = runs?.total ?? 0;
  return (
    <Panel title="Run Lokal (grader CPHub)" subtitle={total ? `${total} run` : undefined}>
      {loading ? (
        <Skeleton className="h-[140px] w-full" />
      ) : total === 0 ? (
        <EmptyPanel
          message="Belum ada run lokal."
          hint={<Link href="/problems" className="text-[12px] text-[#a78bfa] hover:underline">Buka Problemset →</Link>}
        />
      ) : (
        <BarList
          total={total}
          rows={(runs?.verdicts ?? []).map((v) => ({
            key: v.verdict,
            label: VERDICT_LABELS[v.verdict] ?? v.verdict,
            value: v.count,
            color: VERDICT_COLORS[v.verdict] ?? "#71717a",
          }))}
        />
      )}
    </Panel>
  );
}

function SingleProviderView({
  stats, loading, activity, series, solveSeries, tags, tagsLoading,
}: {
  stats: ProviderStats;
  loading: boolean;
  activity: ActivityDay[];
  series: SeriesPoint[];
  solveSeries: SeriesPoint[];
  tags: TagStat[];
  tagsLoading: boolean;
}) {
  const isCF = stats.provider === "codeforces";
  const color = providerColor(stats.provider);
  const label = providerLabel(stats.provider, stats.handle, stats.displayName);
  const identity = accountIdentity(label, stats.handle, stats.providerUsername);
  // Codeforces falls back to its local solve curve when the rating history is
  // empty — an unrated handle, or a failed/rate-limited CF rating fetch, both of
  // which come back as an empty slice. The panel has to retitle itself for that,
  // otherwise a count of solved problems is presented as a rating.
  const useSolve = series.length <= 1 && solveSeries.length > 1;

  return (
    <>
      {!stats.connected && (
        <p className="text-[12px] text-[#a1a1aa]">
          {label} belum terhubung —{" "}
          <Link href="/connections" className="text-[#a78bfa] hover:underline">hubungkan di Connections</Link>
          {stats.submissions > 0 ? ". Angka di bawah dari data yang sudah tersync." : "."}
        </p>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Solved" loading={loading} accent="#34d399"
          value={String(stats.solved)}
          sub={`dari ${stats.attempted} problem dicoba`}
          icon={<CheckCircle2 className="w-3.5 h-3.5" />}
        />
        <StatCard
          label="Submissions" loading={loading} accent="#60a5fa"
          value={String(stats.submissions)}
          sub={`${stats.accepted} accepted`}
          icon={<Send className="w-3.5 h-3.5" />}
        />
        <StatCard
          label="Solve Rate" loading={loading} accent="#fbbf24"
          value={stats.attempted ? pct(stats.solveRate) : "—"}
          sub={`accuracy ${stats.submissions ? pct(stats.accuracy) : "—"}`}
          icon={<Target className="w-3.5 h-3.5" />}
        />
        {stats.rating > 0 ? (
          <StatCard
            label="Rating" loading={loading} accent="#a78bfa"
            value={String(stats.rating)}
            sub={stats.maxRating > stats.rating ? `max ${stats.maxRating}` : identity || label}
            icon={<Trophy className="w-3.5 h-3.5" />}
          />
        ) : (
          <StatCard
            label="Library" loading={loading} accent="#a78bfa"
            value={String(stats.library)}
            sub="problem tersimpan lokal"
            icon={<Library className="w-3.5 h-3.5" />}
          />
        )}
      </div>

      <Panel title="Aktivitas" subtitle={`Submission ${label} per hari, 26 minggu terakhir`}>
        {loading ? <Skeleton className="h-[130px] w-full" /> : <ActivityHeatmap days={activity} weeks={26} />}
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Panel
          title={isCF && !useSolve ? "Rating Progress" : "Problem Terpecahkan (kumulatif)"}
          subtitle={
            !isCF
              ? "Jumlah problem unik yang AC — TLX tidak mengekspos riwayat rating per kontes"
              : useSolve
                ? "Riwayat rating kontes Codeforces belum ada — menampilkan problem unik yang AC"
                : "Dari riwayat kontes Codeforces"
          }
        >
          {loading ? (
            <Skeleton className="h-[200px] w-full" />
          ) : series.length > 1 ? (
            <ProgressChart
              id={`series-${stats.provider}`}
              points={series}
              color={color}
              valueName={isCF ? "Rating" : "Solved"}
            />
          ) : solveSeries.length > 1 ? (
            <ProgressChart id={`solve-${stats.provider}`} points={solveSeries} color="#34d399" valueName="Solved" />
          ) : (
            <EmptyPanel message="Belum cukup data untuk grafik (butuh minimal dua titik)." />
          )}
        </Panel>
        <VerdictPanel stats={stats} />
      </div>

      {stats.official && (
        <p className="text-[11px] text-[#a1a1aa] leading-relaxed">
          {label} sendiri melaporkan{" "}
          <span className="text-[#e4e4e7] font-medium">
            {stats.official.problemsSolved} solved dari {stats.official.problemsTried} problem
          </span>
          {stats.official.score > 0 && <> · {stats.official.score.toLocaleString("id-ID")} poin</>}. Angka
          CPHub di atas ({stats.solved} dari {stats.attempted}) dihitung dari {stats.submissions} submission
          yang berhasil diambil — feed submission mencakup riwayat yang lebih pendek daripada agregat
          profil, jadi selisihnya wajar. Chart verdict di bawah per submission, bukan per problem.
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <LanguagePanel stats={stats} />
        {isCF ? <DifficultyPanel stats={stats} /> : <TagPanel tags={tags} loading={tagsLoading} />}
      </div>

      {isCF && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <TagPanel tags={tags} loading={tagsLoading} />
          <Panel title="Ringkasan" subtitle="Angka mentah untuk provider ini">
            <ProviderCard stats={stats} />
          </Panel>
        </div>
      )}
    </>
  );
}
