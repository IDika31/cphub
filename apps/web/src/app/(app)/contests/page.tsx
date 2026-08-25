"use client";

import { useState, useEffect, useCallback } from "react";
import { Trophy, RefreshCw, Download, ExternalLink } from "lucide-react";
import Topbar from "@/components/shell/topbar";
import Button from "@/components/ui/button";
import Badge from "@/components/ui/badge";
import Skeleton from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import {
  fetchContests, syncCFContests, syncCFContestProblems, registerContest, type Contest,
} from "@/lib/api/codeforces";

/** Phase is Codeforces' own vocabulary; only BEFORE can still be registered for. */
function phaseBadge(phase: string): "verdict-ac" | "verdict-pending" | "time" {
  if (phase === "CODING") return "verdict-ac";
  if (phase === "BEFORE") return "verdict-pending";
  return "time";
}

function formatStart(iso?: string): string {
  if (!iso) return "jadwal belum diumumkan";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "jadwal belum diumumkan";
  return d.toLocaleString("id-ID", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function formatDuration(seconds: number): string {
  if (!seconds) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return m ? `${h}j ${m}m` : `${h} jam`;
}

export default function ContestsPage() {
  const [contests, setContests] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);
  const [upcomingOnly, setUpcomingOnly] = useState(true);
  const [busy, setBusy] = useState("");
  const { addToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchContests({ upcoming: upcomingOnly, limit: 60 });
      setContests(res.data);
    } catch (err) {
      addToast("error", `Gagal memuat contest: ${(err as Error).message || "cek koneksi API"}`);
    } finally {
      setLoading(false);
    }
  }, [upcomingOnly, addToast]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSync() {
    setBusy("sync");
    try {
      const res = await syncCFContests();
      addToast("success", `${res.written} contest tersimpan (${res.elapsed})`);
      load();
    } catch (err) {
      addToast("error", `Sync contest gagal: ${(err as Error).message || "cek koneksi API"}`);
    } finally {
      setBusy("");
    }
  }

  async function handleRegister(c: Contest) {
    setBusy(c.id);
    try {
      const res = await registerContest(c.contestRef);
      addToast("success", `Terdaftar di ${c.name} sebagai ${res.handle}`);
    } catch (err) {
      // Registration opens six hours before a round and closes five minutes before
      // the start, so a refusal is usually the window, not a broken call.
      addToast("error", `Registrasi gagal: ${(err as Error).message || "cek akun Codeforces di Connections"}`);
    } finally {
      setBusy("");
    }
  }

  async function handleImportProblems(c: Contest) {
    setBusy(c.id + "-problems");
    try {
      const res = await syncCFContestProblems(c.contestRef);
      addToast("success", `${res.written} problem dari ${res.contest} masuk Problemset`);
    } catch (err) {
      addToast("error", `Import problem gagal: ${(err as Error).message || "cek koneksi API"}`);
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <Topbar title="Contests">
        <Button variant="ghost" onClick={() => setUpcomingOnly((v) => !v)}>
          {upcomingOnly ? "Tampilkan semua" : "Hanya yang akan datang"}
        </Button>
        <Button variant="primary" onClick={handleSync} disabled={busy === "sync"}>
          <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
          {busy === "sync" ? "Sync..." : "Sync dari Codeforces"}
        </Button>
      </Topbar>

      <div className="flex-1 overflow-y-auto p-[14px]">
        {loading ? (
          <div className="space-y-2 max-w-[760px]">
            <Skeleton className="h-[64px] w-full" />
            <Skeleton className="h-[64px] w-full" />
            <Skeleton className="h-[64px] w-full" />
          </div>
        ) : contests.length === 0 ? (
          <p className="text-[13px] text-[#a1a1aa] bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-[8px] p-[14px] max-w-[760px]">
            Belum ada contest tersimpan. Klik <strong className="text-[#e4e4e7]">Sync dari Codeforces</strong> —
            daftarnya diambil lewat API resmi, tanpa perlu login.
          </p>
        ) : (
          <ul className="space-y-2 max-w-[760px]">
            {contests.map((c) => (
              <li
                key={c.id}
                className="bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-[8px] p-[14px] flex flex-wrap items-center gap-x-4 gap-y-2"
              >
                <Trophy className="w-4 h-4 text-[#a78bfa] flex-shrink-0" aria-hidden="true" />
                <div className="flex-1 min-w-[220px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-semibold text-[#e4e4e7]">{c.name}</span>
                    <Badge variant={phaseBadge(c.phase)}>{c.phase}</Badge>
                    {c.type && <span className="text-[11px] text-[#a1a1aa]">{c.type}</span>}
                  </div>
                  <div className="text-[11px] text-[#a1a1aa] mt-0.5">
                    {formatStart(c.startTime)}
                    {c.durationSeconds ? ` · ${formatDuration(c.durationSeconds)}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {c.phase === "BEFORE" && (
                    <Button variant="primary" onClick={() => handleRegister(c)} disabled={busy === c.id}>
                      {busy === c.id ? "Mendaftar..." : "Register"}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    onClick={() => handleImportProblems(c)}
                    disabled={busy === c.id + "-problems"}
                    title="Ambil daftar problem contest ini ke Problemset"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    {busy === c.id + "-problems" ? "Import..." : "Problem"}
                  </Button>
                  <a href={c.url} target="_blank" rel="noopener noreferrer" title="Buka di Codeforces">
                    <Button variant="ghost">
                      <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                    </Button>
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
