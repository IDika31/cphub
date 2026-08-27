"use client";

import { useState, useEffect, useCallback } from "react";
import { Trophy, RefreshCw, Download, ExternalLink, CheckCircle2, Lock } from "lucide-react";
import Topbar from "@/components/shell/topbar";
import Button from "@/components/ui/button";
import Badge from "@/components/ui/badge";
import Skeleton from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import {
  fetchContests, syncCFContests, syncCFContestProblems, registerContestPreferBrowser, type Contest,
} from "@/lib/api/codeforces";
import { hasExtension, syncContestStatesViaExtension } from "@/lib/extension-bridge";

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

/** Codeforces states registration windows relatively ("Before registration 5 days"), and
 *  that reads better here too — "buka 5 hari lagi" answers the question directly, while a
 *  date makes the reader do the subtraction. */
function formatOpensIn(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return `${days} hari lagi`;
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 1) return `${hours} jam lagi`;
  return `${Math.max(1, Math.floor(ms / 60_000))} menit lagi`;
}

function registrationOpen(c: Contest): boolean {
  // Unknown window means "let Codeforces decide": the button is offered, and a refusal
  // carries Codeforces' own wording. A wrongly hidden button could keep someone out.
  if (!c.registrationOpensAt) return true;
  return new Date(c.registrationOpensAt).getTime() <= Date.now();
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

  // Ask the extension once what Codeforces itself says about every upcoming contest.
  //
  // This is the only accurate source — no Codeforces read API exposes registration — and
  // it is the only way a round the user joined directly on the site becomes visible here.
  // Silent on failure: no extension is the normal case, not an error worth a toast.
  useEffect(() => {
    let cancelled = false;
    // Asked first, and cheaply: the state sync itself waits up to ninety seconds for a
    // reply, so firing it blind left every extension-less visitor with a pending call for
    // that whole time. hasExtension answers in 2.5 s or says no.
    hasExtension()
      .then((present) => {
        if (cancelled || !present) return;
        return syncContestStatesViaExtension().then((res) => {
          if (cancelled || res.saved.seen === 0) return;
          load();
        });
      })
      .catch(() => {
        /* no extension, or Codeforces unreachable from this browser */
      });
    return () => { cancelled = true; };
    // Deliberately once per mount, not on every `load` change: this triggers a reload
    // itself, and depending on load would chase its own tail.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      const res = await registerContestPreferBrowser(c.contestRef);
      addToast(
        "success",
        res.already
          ? `Kamu sudah terdaftar di ${c.name}`
          : `Terdaftar di ${c.name}`,
      );
      // Flip this row locally instead of refetching: the server has recorded it, and one
      // changed boolean is not worth reloading sixty contests for.
      setContests((prev) => prev.map((x) => (x.id === c.id ? { ...x, registered: true } : x)));
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
                  {/* The same three states Codeforces' own contest list shows: already in,
                      not open yet, or open. "Already in" is kept for CODING too, because
                      "am I in this running contest" is worth answering; a finished round
                      makes it noise, so it stops there. */}
                  {c.registered && (c.phase === "BEFORE" || c.phase === "CODING") ? (
                    <span className="inline-flex items-center gap-1.5 text-[12px] text-[#34d399] bg-[rgba(16,185,129,0.10)] border border-[rgba(16,185,129,0.25)] rounded-[6px] px-2.5 py-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                      Sudah terdaftar
                    </span>
                  ) : c.phase === "BEFORE" && !registrationOpen(c) ? (
                    <span
                      className="inline-flex items-center gap-1.5 text-[12px] text-[#a1a1aa] bg-[rgba(161,161,170,0.10)] border border-[rgba(161,161,170,0.25)] rounded-[6px] px-2.5 py-1.5"
                      title={`Registrasi dibuka ${formatStart(c.registrationOpensAt)}`}
                    >
                      <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                      Registrasi buka {formatOpensIn(c.registrationOpensAt!)}
                    </span>
                  ) : c.phase === "BEFORE" ? (
                    <Button variant="primary" onClick={() => handleRegister(c)} disabled={busy === c.id}>
                      {busy === c.id ? "Mendaftar..." : "Register"}
                    </Button>
                  ) : null}
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
