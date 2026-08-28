"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ShieldCheck, ShieldAlert, ExternalLink, RefreshCw, Loader2 } from "lucide-react";
import Topbar from "@/components/shell/topbar";
import Button from "@/components/ui/button";
import Skeleton from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import {
  fetchCFSessionStatus,
  announceCFSessionChange,
  type CFSessionStatus,
} from "@/lib/api/codeforces";
import {
  hasExtension,
  loginCodeforcesViaExtension,
  ExtensionMissingError,
} from "@/lib/extension-bridge";

const CF_ENTER_URL = "https://codeforces.com/enter";

/**
 * Verification has its own page because it is the one Codeforces thing only the user
 * can do, and because it stops being relevant the moment it is done — the sidebar
 * hides this entry while the session is good and brings it back when Codeforces stops
 * accepting it.
 *
 * The Codeforces page itself is deliberately NOT embedded. Every Codeforces page
 * carries `if (window.parent.frames.length > 0) window.stop()` and refuses to render
 * inside a frame, and a Cloudflare challenge will not run in one either. So this page
 * drives a real tab instead: the extension opens codeforces.com/enter, waits for the
 * login to finish there, and hands CPHub the resulting cookies. The password never
 * passes through CPHub, and 2FA or an interactive Cloudflare prompt is just the user's
 * normal login.
 */
export default function VerifyCodeforcesPage() {
  const { addToast } = useToast();
  const [status, setStatus] = useState<CFSessionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"" | "verify" | "probe">("");
  const [ext, setExt] = useState<"checking" | "ready" | "absent">("checking");
  const [error, setError] = useState("");

  const load = useCallback(async (probe = false) => {
    try {
      const next = await fetchCFSessionStatus(probe);
      setStatus(next);
      setError("");
      announceCFSessionChange();
      return next;
    } catch (err) {
      setError((err as Error).message || "Gagal membaca status sesi");
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    // The cheap read on mount, never the probe: landing here must not spend a request
    // on codeforces.com — or a Chromium launch — before the user asks for one.
    load().finally(() => {
      if (!cancelled) setLoading(false);
    });
    hasExtension().then((present) => {
      if (!cancelled) setExt(present ? "ready" : "absent");
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function handleVerify() {
    setBusy("verify");
    setError("");
    try {
      const res = await loginCodeforcesViaExtension();
      const next = await load();
      addToast(
        "success",
        next?.valid
          ? `Codeforces terverifikasi sebagai ${next.handle ?? res.handle}`
          : `Login terbaca sebagai ${res.handle}, tapi sesi belum tersimpan — coba Cek ulang`,
      );
    } catch (err) {
      if (err instanceof ExtensionMissingError) {
        setExt("absent");
        setError(
          "Extension CPHub tidak menjawab. Pasang extension-nya, atau login manual di tab Codeforces lalu tekan Cek ulang.",
        );
      } else {
        setError((err as Error).message || "Verifikasi gagal");
      }
    } finally {
      setBusy("");
    }
  }

  async function handleProbe() {
    setBusy("probe");
    const next = await load(true);
    setBusy("");
    if (!next) return;
    if (next.valid) {
      addToast("success", `Sesi Codeforces aktif${next.handle ? ` sebagai ${next.handle}` : ""}`);
      return;
    }
    if (next.reason === "unreachable") {
      // Not the user's problem, and not a dead session either: saying "kedaluwarsa"
      // here would send them to log in again for nothing.
      addToast("info", "Codeforces tidak bisa dihubungi dari server — sesi belum tentu mati, coba lagi nanti.");
      return;
    }
    addToast("error", "Codeforces menolak sesi yang tersimpan — perlu verifikasi ulang.");
  }

  const valid = status?.valid === true;

  return (
    <>
      <Topbar title="Verifikasi Codeforces" />

      <div className="flex-1 overflow-y-auto p-[14px]">
        <div className="max-w-[640px] space-y-4">
          {loading ? (
            <Skeleton className="h-[120px] w-full" />
          ) : (
            <div
              className={`rounded-[10px] border p-[14px] ${
                valid
                  ? "border-[rgba(16,185,129,0.25)] bg-[rgba(16,185,129,0.10)]"
                  : "border-[rgba(251,191,36,0.25)] bg-[rgba(251,191,36,0.10)]"
              }`}
            >
              <div className="flex items-start gap-3">
                {valid ? (
                  <ShieldCheck className="w-5 h-5 text-[#34d399] flex-shrink-0" aria-hidden="true" />
                ) : (
                  <ShieldAlert className="w-5 h-5 text-[#fbbf24] flex-shrink-0" aria-hidden="true" />
                )}
                <div className="space-y-1">
                  <p className="text-[13px] text-[#e4e4e7] font-medium">
                    {valid
                      ? `Sesi aktif${status?.handle ? ` sebagai ${status.handle}` : ""}`
                      : status?.linked === false
                        ? "Akun Codeforces belum dihubungkan"
                        : status?.reason === "no_session"
                          ? "Akun terhubung, tapi belum ada sesi browser"
                          : "Sesi Codeforces sudah kedaluwarsa"}
                  </p>
                  <p className="text-[12px] text-[#a1a1aa]">
                    {valid
                      ? "Tidak ada yang perlu dilakukan. Menu ini hilang dari sidebar sampai Codeforces menolak sesinya lagi."
                      : "Submit dan registrasi contest butuh sesi Codeforces yang hidup. Verifikasi sekali, dan halaman ini berhenti muncul."}
                  </p>
                  {status?.checkedAt && (
                    <p className="text-[11px] text-[#71717a]">
                      Terakhir dicek {new Date(status.checkedAt).toLocaleString("id-ID")}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {error && (
            <p role="alert" className="text-[12px] text-[#f87171]">
              {error}
            </p>
          )}

          <div className="rounded-[10px] border border-[rgba(255,255,255,0.08)] bg-[#18181b] p-[14px] space-y-3">
            <p className="text-[13px] text-[#e4e4e7] font-medium">Cara kerjanya</p>
            <p className="text-[12px] text-[#a1a1aa] leading-relaxed">
              CPHub membuka halaman login Codeforces di tab baru dan menunggu sampai kamu
              masuk di sana. Password kamu tidak pernah lewat CPHub, dan 2FA atau prompt
              Cloudflare cuma login biasa dari sisi kamu. Halaman Codeforces tidak bisa
              ditampilkan di dalam CPHub: setiap halamannya menolak dijalankan di dalam
              frame, dan challenge Cloudflare juga tidak jalan di sana.
            </p>
            <p className="text-[12px] text-[#a1a1aa] leading-relaxed">
              Yang dikirim ke server hanya cookie identitas.{" "}
              <code className="text-[#e4e4e7]">cf_clearance</code> sengaja tidak dikirim —
              Cloudflare mengikatnya ke IP yang mendapatkannya, jadi salinannya tidak
              berguna di server.
            </p>
            {ext === "absent" && (
              <p className="text-[12px] text-[#fbbf24]">
                Extension CPHub tidak terdeteksi di browser ini.{" "}
                <Link href="/extension" className="underline hover:text-[#fcd34d]">
                  Pasang dulu
                </Link>{" "}
                supaya verifikasi jadi satu klik.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={handleVerify} disabled={busy !== "" || ext === "checking"}>
              {busy === "verify" ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  Menunggu login...
                </>
              ) : (
                <>
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                  {valid ? "Verifikasi ulang" : "Buka login Codeforces"}
                </>
              )}
            </Button>
            <Button variant="default" onClick={handleProbe} disabled={busy !== ""}>
              {busy === "probe" ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  Mengecek...
                </>
              ) : (
                <>
                  <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                  Cek ulang
                </>
              )}
            </Button>
            <a
              href={CF_ENTER_URL}
              target="_blank"
              rel="noreferrer"
              className="text-[12px] text-[#8b5cf6] hover:underline"
            >
              Buka codeforces.com/enter sendiri
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
