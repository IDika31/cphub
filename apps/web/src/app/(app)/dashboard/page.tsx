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
  fetchDashboardOverview, fetchActivity, fetchProgress, fetchTagWeakness,
  syncCFSubmissions, syncTLXSubmissions,
  type DashboardOverview, type ProviderStats, type ActivityDay, type SeriesPoint, type TagStat,
  type ProgressSeries,
} from "@/lib/api/dashboard";
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
  const [scope, setScope] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<"" | "cf" | "tlx">("");
  const { addToast } = useToast();

  const loadData = useCallback(async () => {
    setLoading(true);
    const [overview, act, prog] = await Promise.all([
      fetchDashboardOverview().catch(() => null),
      fetchActivity(365).catch(() => ({ data: [] as ActivityDay[], since: "", days: 0 })),
      fetchProgress().catch(() => ({}) as ProgressSeries),
    ]);
    setData(overview);
    setActivity(act.data);
    setProgress(prog);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Tag stats are scoped to the selected provider, so switching tabs refetches
  // only that one panel instead of the whole dashboard.
  useEffect(() => {
    fetchTagWeakness(scope === "all" ? undefined : scope, 12)
      .then((res) => setTags(res.data))
      .catch(() => setTags([]));
  }, [scope]);

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
        // carried into a scoped view — it would colour a day on the strength of a
        // different judge. The API breaks it down per provider for exactly this.
        const solved = d.solvedByProvider?.[scope] ?? Math.min(d.solved, count);
        return { ...d, count, solved, byProvider: { [scope]: count } };
      })
      .filter((d) => d.count > 0);
  }, [activity, scope]);

  async function runSync(kind: "cf" | "tlx") {
    setSyncing(kind);
    try {
      if (kind === "cf") {
        const res = await syncCFSubmissions();
        addToast("success", `Codeforces: ${res.submissions} submission baru, ${res.problems} problem baru (dari ${res.fetched} diambil)`);
      } else {
        const res = await syncTLXSubmissions();
        const off = res.official
          ? ` · TLX: ${res.official.problemsSolved}/${res.official.problemsTried} problem, ${res.official.score} pts`
          : "";
        addToast("success", `TLX: ${res.submissions} submission baru (dari ${res.fetched} diambil)${off}`);
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
        <Button
          variant="default"
          onClick={() => runSync("cf")}
          disabled={syncing !== "" || !cf?.connected}
          title={cf?.connected ? "Ambil ulang submission Codeforces" : "Hubungkan Codeforces dulu"}
        >
          <RefreshCw className={`w-3 h-3 ${syncing === "cf" ? "animate-spin" : ""}`} aria-hidden="true" />
          {syncing === "cf" ? "Syncing..." : "Sync CF"}
        </Button>
        <Button
          variant="default"
          onClick={() => runSync("tlx")}
          disabled={syncing !== "" || tlxConnected.length === 0}
          title={tlxConnected.length > 0 ? "Ambil ulang submission dari semua instance TLX terhubung" : "Hubungkan TLX dulu"}
        >
          <RefreshCw className={`w-3 h-3 ${syncing === "tlx" ? "animate-spin" : ""}`} aria-hidden="true" />
          {syncing === "tlx" ? "Syncing..." : "Sync TLX"}
        </Button>
      </Topbar>

      <div className="flex-1 overflow-y-auto p-[14px] space-y-4">
        {!loading && !anyConnected && (
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

        <ScopeTabs
          scope={scope}
          onChange={setScope}
          providers={providers}
          loading={loading}
        />

        {scope === "all" ? (
          <AllProvidersView
            data={data}
            providers={providers}
            loading={loading}
            activity={scopedActivity}
            progress={progress}
            tags={tags}
          />
        ) : selected ? (
          <SingleProviderView
            stats={selected}
            loading={loading}
            activity={scopedActivity}
            series={scope === "codeforces" ? (progress.codeforces ?? []) : (progress[scope] ?? [])}
            solveSeries={progress[scope === "codeforces" ? "local" : scope] ?? []}
            tags={tags}
          />
        ) : (
          <Panel title={providerLabel(scope)}>
            <EmptyPanel message="Provider ini belum punya data." />
          </Panel>
        )}
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
          aria-selected={scope === t.value}
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
  data, providers, loading, activity, progress, tags,
}: {
  data: DashboardOverview | null;
  providers: ProviderStats[];
  loading: boolean;
  activity: ActivityDay[];
  progress: ProgressSeries;
  tags: TagStat[];
}) {
  const t = data?.totals;
  const withData = providers.filter((p) => p.submissions > 0 || p.connected);
  const cfRating = progress.codeforces ?? [];
  // Every TLX-family instance charts its own solve curve; "local" is Codeforces'.
  const solveCurves = Object.entries(progress)
    .filter(([key, pts]) => key !== "codeforces" && pts.length > 1)
    .sort((a, b) => b[1].length - a[1].length);

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Problem Solved" loading={loading} accent="#34d399"
          value={String(t?.solved ?? 0)}
          sub={`${t?.attempted ?? 0} dicoba · semua provider`}
          icon={<CheckCircle2 className="w-3.5 h-3.5" />}
        />
        <StatCard
          label="Submissions" loading={loading} accent="#60a5fa"
          value={String(t?.submissions ?? 0)}
          sub={`${t?.accepted ?? 0} accepted`}
          icon={<Send className="w-3.5 h-3.5" />}
        />
        <StatCard
          label="Accuracy" loading={loading} accent="#fbbf24"
          value={t ? pct(t.accuracy) : "—"}
          sub="AC / total submission"
          icon={<Percent className="w-3.5 h-3.5" />}
        />
        <StatCard
          label="Streak" loading={loading} accent="#fb923c"
          value={`${t?.streak ?? 0} hari`}
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
          <EmptyPanel
            message="Belum ada provider tersync."
            hint={<Link href="/connections" className="text-[12px] text-[#a78bfa] hover:underline">Ke Connections →</Link>}
          />
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

        <Panel title="Problem Terpecahkan (kumulatif)" subtitle="Problem unik yang AC — TLX tidak mengekspos riwayat rating per kontes">
          {loading ? (
            <Skeleton className="h-[200px] w-full" />
          ) : solveCurves.length > 0 ? (
            <ProgressChart
              id={`solve-${solveCurves[0][0]}`}
              points={solveCurves[0][1]}
              color={providerColor(solveCurves[0][0] === "local" ? "codeforces" : solveCurves[0][0])}
              valueName="Solved"
            />
          ) : (
            <EmptyPanel message="Belum cukup data solve untuk digambar." />
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <TagPanel tags={tags} loading={loading} />
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
  stats, loading, activity, series, solveSeries, tags,
}: {
  stats: ProviderStats;
  loading: boolean;
  activity: ActivityDay[];
  series: SeriesPoint[];
  solveSeries: SeriesPoint[];
  tags: TagStat[];
}) {
  const isCF = stats.provider === "codeforces";
  const color = providerColor(stats.provider);
  const label = providerLabel(stats.provider, stats.handle, stats.displayName);
  const identity = accountIdentity(label, stats.handle, stats.providerUsername);

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
          title={isCF ? "Rating Progress" : "Problem Terpecahkan (kumulatif)"}
          subtitle={isCF ? "Dari riwayat kontes Codeforces" : "Jumlah problem unik yang AC — TLX tidak mengekspos riwayat rating per kontes"}
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
        {isCF ? <DifficultyPanel stats={stats} /> : <TagPanel tags={tags} loading={loading} />}
      </div>

      {isCF && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <TagPanel tags={tags} loading={loading} />
          <Panel title="Ringkasan" subtitle="Angka mentah untuk provider ini">
            <ProviderCard stats={stats} />
          </Panel>
        </div>
      )}
    </>
  );
}
