"use client";

import { useState, useEffect, useId } from "react";
import Topbar from "@/components/shell/topbar";
import Button from "@/components/ui/button";
import Badge from "@/components/ui/badge";
import Skeleton from "@/components/ui/skeleton";
import Modal from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { fetchConnections, unlinkAccount, linkTLX, linkTLXCustom, type LinkedAccount } from "@/lib/api/connections";
import { loginCodeforces } from "@/lib/api/codeforces";
import { apiClient, API_BASE_URL } from "@/lib/api/client";
import ImportTLXModal from "@/components/tlx/ImportTLXModal";
import { providerLabel, PROVIDER_TLX_CUSTOM } from "@/lib/providers";

interface ProviderRow {
  name: string;
  provider: string;
  connected: boolean;
  account: LinkedAccount | null;
  description: string;
}

export default function ConnectionsPage() {
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tlxModalOpen, setTlxModalOpen] = useState(false);
  const [tlxUsername, setTlxUsername] = useState("");
  const [tlxPassword, setTlxPassword] = useState("");
  const [tlxLoading, setTlxLoading] = useState(false);
  const [tlxError, setTlxError] = useState("");
  const [tlxImportOpen, setTlxImportOpen] = useState(false);
  // Codeforces logs in with handle+password like TLX does. It has no OAuth of its
  // own, and only a real session can submit or register, so this is the primary
  // path — the old OAuth button stays as a secondary option.
  const [cfModalOpen, setCfModalOpen] = useState(false);
  const [cfHandle, setCfHandle] = useState("");
  const [cfPassword, setCfPassword] = useState("");
  const [cfSavePassword, setCfSavePassword] = useState(true);
  const [cfLoading, setCfLoading] = useState(false);
  const [cfError, setCfError] = useState("");
  const cfHandleId = useId();
  const cfPassId = useId();
  const [customTLX, setCustomTLX] = useState<LinkedAccount[]>([]);
  // A self-hosted Judgels instance logs in exactly like tlx.toki.id — same
  // /session/login, same /users/me — so it gets the same form, keyed by host.
  const [customHost, setCustomHost] = useState<string | null>(null);
  const [customUser, setCustomUser] = useState("");
  const [customPass, setCustomPass] = useState("");
  const [customLoading, setCustomLoading] = useState(false);
  const [customError, setCustomError] = useState("");
  const customUserId = useId();
  const customPassId = useId();
  const { addToast } = useToast();
  const tlxUserId = useId();
  const tlxPassId = useId();

  useEffect(() => {
    loadData();
  }, []);

  async function handleLink(provider: string) {
    switch (provider) {
      case "codeforces":
        // Password login, not OAuth: only a browser session can submit code or
        // register for a contest.
        setCfModalOpen(true);
        break;
      case "tlx":
        setTlxModalOpen(true);
        break;
      case "google":
        window.location.href = `${API_BASE_URL}/api/auth/google`;
        break;
    }
  }

  async function startCodeforcesOAuth() {
    try {
      const res = await apiClient<{ redirectUrl: string }>("/api/accounts/codeforces", { method: "POST" });
      window.location.href = res.redirectUrl;
    } catch (err) {
      setCfError(`OAuth Codeforces gagal dimulai: ${(err as Error).message || "cek koneksi API"}`);
    }
  }

  async function handleCodeforcesSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCfLoading(true);
    setCfError("");
    try {
      const res = await loginCodeforces(cfHandle, cfPassword, cfSavePassword);
      addToast("success", `Codeforces terhubung sebagai ${res.handle}`);
      if (res.warning) addToast("error", res.warning);
      setCfModalOpen(false);
      setCfHandle("");
      setCfPassword("");
      loadData();
    } catch (err) {
      setCfError((err as Error).message || "Login Codeforces gagal");
    } finally {
      setCfLoading(false);
    }
  }

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetchConnections();
      const accounts = res.data;
      // Registered automatically by the extension via /api/sync/tlx-hosts, so
      // they are listed rather than offered as something to "Link".
      setCustomTLX(accounts.filter((a) => a.provider === PROVIDER_TLX_CUSTOM));
      setProviders([
        {
          name: "Codeforces",
          provider: "codeforces",
          connected: accounts.some((a) => a.provider === "codeforces" && a.isConnected),
          account: accounts.find((a) => a.provider === "codeforces") || null,
          description: "Hubungkan akun Codeforces via OAuth untuk sync problem dan submission.",
        },
        {
          name: "TLX TOKI (tlx.toki.id)",
          provider: "tlx",
          connected: accounts.some((a) => a.provider === "tlx" && a.isConnected),
          account: accounts.find((a) => a.provider === "tlx") || null,
          description: "Hubungkan akun TLX untuk import problem langsung via API.",
        },
        {
          name: "Google",
          provider: "google",
          connected: accounts.some((a) => a.provider === "google" && a.isConnected),
          account: accounts.find((a) => a.provider === "google") || null,
          description: "Akun Google digunakan untuk login.",
        },
      ]);
    } catch (err) {
      addToast("error", `Gagal memuat connections: ${(err as Error).message || "cek koneksi API"}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleUnlink(id: string) {
    // Unlink drops the stored token — cheap to redo, but never silently.
    if (!confirm("Putuskan akun ini? Sync dari provider tersebut akan berhenti sampai di-link ulang.")) return;
    try {
      await unlinkAccount(id);
      addToast("success", "Akun diputus");
      loadData();
    } catch (err) {
      addToast("error", `Gagal unlink: ${(err as Error).message || "cek koneksi API"}`);
    }
  }

  async function handleCustomSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customHost) return;
    setCustomLoading(true);
    setCustomError("");
    try {
      const res = await linkTLXCustom(customHost, customUser, customPass);
      addToast("success", `${res.host} terhubung sebagai ${res.username}`);
      setCustomHost(null);
      setCustomUser("");
      setCustomPass("");
      loadData();
    } catch (err) {
      setCustomError((err as Error).message || "Gagal login ke instance ini");
    } finally {
      setCustomLoading(false);
    }
  }

  async function handleTLXSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTlxLoading(true);
    setTlxError("");
    try {
      await linkTLX(tlxUsername, tlxPassword);
      setTlxModalOpen(false);
      setTlxUsername("");
      setTlxPassword("");
      loadData();
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message || "Gagal menghubungkan akun TLX";
      setTlxError(msg);
    } finally {
      setTlxLoading(false);
    }
  }

  return (
    <>
      <Topbar title="Connections" />
      <div className="flex-1 overflow-y-auto p-[14px]">
        {loading ? (
          <div className="space-y-3 max-w-[600px]">
            <Skeleton className="h-[72px] w-full" />
            <Skeleton className="h-[72px] w-full" />
            <Skeleton className="h-[72px] w-full" />
          </div>
        ) : (
          <div className="space-y-3 max-w-[600px]">
            {providers.map((p) => (
              <div
                key={p.provider}
                className="bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-[8px] p-[16px] flex flex-wrap items-center gap-x-4 gap-y-3"
              >
                <div
                  className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                    p.connected ? "bg-[#10b981]" : "bg-[#71717a]"
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[14px] font-semibold text-[#e4e4e7]">
                      {p.name}
                    </span>
                    {p.connected ? (
                      <Badge variant="verdict-ac">Connected</Badge>
                    ) : (
                      <Badge variant="verdict-pending">Not Connected</Badge>
                    )}
                  </div>
                  {p.connected && p.account ? (
                    <p className="text-[12px] text-[#a1a1aa]">
                      {p.account.handle || p.account.provider}
                      {p.account.rating > 0 && ` · Rating: ${p.account.rating} (max ${p.account.maxRating})`}
                    </p>
                  ) : (
                    <p className="text-[12px] text-[#a1a1aa]">{p.description}</p>
                  )}
                </div>
                {p.connected && p.account ? (
                  <div className="flex items-center gap-2">
                    {p.provider === "tlx" && (
                      <Button variant="ghost" onClick={() => setTlxImportOpen(true)}>
                        Import Problem
                      </Button>
                    )}
                    <Button
                      variant="danger"
                      onClick={() => handleUnlink(p.account!.id)}
                    >
                      Unlink
                    </Button>
                  </div>
                ) : (
                  <Button variant="primary" onClick={() => handleLink(p.provider)}>
                    Link
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {!loading && (
          <div className="max-w-[600px] mt-6">
            <h2 className="text-[13px] font-semibold text-[#e4e4e7] mb-1">TLX Custom Instance</h2>
            <p className="text-[12px] text-[#a1a1aa] mb-3">
              Judgels/TLX self-hosted yang kamu tambahkan di extension muncul di sini otomatis —
              terpisah dari TLX TOKI resmi supaya tidak tertukar. Hapus host-nya di extension untuk
              melepas tautan.
            </p>
            {customTLX.length === 0 ? (
              <p className="text-[12px] text-[#a1a1aa] bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-[8px] p-[14px]">
                Belum ada. Tambahkan host di extension Settings, lalu buka halaman problem-nya sekali —
                extension mendaftarkannya ke sini.
              </p>
            ) : (
              <ul className="space-y-2">
                {customTLX.map((a) => (
                  <li
                    key={a.id}
                    className="bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-[8px] p-[14px] flex flex-wrap items-center gap-x-3 gap-y-2"
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-[#a78bfa] flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium text-[#e4e4e7] truncate">
                        {providerLabel(a.provider, a.handle, a.displayName)}
                      </div>
                      <div className="text-[11px] text-[#a1a1aa] truncate">
                        {a.handle}
                        {" · "}
                        {a.isConnected && a.providerUsername
                          ? `terhubung sebagai ${a.providerUsername}`
                          : "belum login"}
                        {a.providerUserId ? ` · api: ${a.providerUserId}` : ""}
                      </div>
                    </div>
                    {a.isConnected && a.providerUsername ? (
                      <div className="flex items-center gap-2">
                        <Badge variant="verdict-ac">{a.providerUsername}</Badge>
                        <Button variant="danger" onClick={() => handleUnlink(a.id)}>Unlink</Button>
                      </div>
                    ) : (
                      <Button variant="primary" onClick={() => { setCustomHost(a.handle); setCustomError(""); }}>
                        Login
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <ImportTLXModal
          open={tlxImportOpen}
          onClose={() => setTlxImportOpen(false)}
        />

        <Modal
          open={customHost !== null}
          onClose={() => { setCustomHost(null); setCustomError(""); }}
          title={`Login ke ${customHost ?? ""}`}
        >
          <form onSubmit={handleCustomSubmit} className="space-y-4">
            <p className="text-[13px] text-[#a1a1aa]">
              Instance ini menjalankan Judgels, software yang sama dengan TLX TOKI — endpoint
              login-nya identik, cuma domainnya beda. Pakai akun kamu di{" "}
              <span className="text-[#e4e4e7]">{customHost}</span>.
            </p>
            <div className="space-y-2">
              <label htmlFor={customUserId} className="block text-[12px] text-[#a1a1aa]">Username</label>
              <input
                id={customUserId}
                type="text"
                value={customUser}
                onChange={(e) => setCustomUser(e.target.value)}
                required
                autoComplete="username"
                className="w-full bg-[#09090b] border border-[rgba(255,255,255,0.08)] rounded-[6px] px-3 py-2 text-[13px] text-[#e4e4e7] placeholder-[#a1a1aa] focus:outline-none focus:border-[#8b5cf6]"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor={customPassId} className="block text-[12px] text-[#a1a1aa]">Password</label>
              <input
                id={customPassId}
                type="password"
                value={customPass}
                onChange={(e) => setCustomPass(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full bg-[#09090b] border border-[rgba(255,255,255,0.08)] rounded-[6px] px-3 py-2 text-[13px] text-[#e4e4e7] placeholder-[#a1a1aa] focus:outline-none focus:border-[#8b5cf6]"
              />
            </div>
            {customError && <p role="alert" className="text-[12px] text-[#f87171]">{customError}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={() => { setCustomHost(null); setCustomError(""); }}>
                Batal
              </Button>
              <Button type="submit" variant="primary" disabled={customLoading}>
                {customLoading ? "Menghubungkan..." : "Hubungkan"}
              </Button>
            </div>
          </form>
        </Modal>

        <Modal open={cfModalOpen} onClose={() => { setCfModalOpen(false); setCfError(""); }} title="Hubungkan Codeforces">
          <form onSubmit={handleCodeforcesSubmit} className="space-y-4">
            <p className="text-[13px] text-[#a1a1aa]">
              Codeforces tidak punya API untuk submit maupun daftar contest, jadi CPHub
              menyimpan sesi login kamu dan memakai sesi itu. Password hanya dipakai untuk
              login; kalau disimpan, disimpan terenkripsi di server.
            </p>
            <div className="space-y-2">
              <label htmlFor={cfHandleId} className="block text-[12px] text-[#a1a1aa]">Handle atau email</label>
              <input
                id={cfHandleId}
                type="text"
                value={cfHandle}
                onChange={(e) => setCfHandle(e.target.value)}
                placeholder="handle Codeforces"
                required
                autoComplete="username"
                className="w-full bg-[#09090b] border border-[rgba(255,255,255,0.08)] rounded-[6px] px-3 py-2 text-[13px] text-[#e4e4e7] placeholder-[#a1a1aa] focus:outline-none focus:border-[#8b5cf6]"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor={cfPassId} className="block text-[12px] text-[#a1a1aa]">Password</label>
              <input
                id={cfPassId}
                type="password"
                value={cfPassword}
                onChange={(e) => setCfPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className="w-full bg-[#09090b] border border-[rgba(255,255,255,0.08)] rounded-[6px] px-3 py-2 text-[13px] text-[#e4e4e7] placeholder-[#a1a1aa] focus:outline-none focus:border-[#8b5cf6]"
              />
            </div>
            <label className="flex items-start gap-2 text-[12px] text-[#a1a1aa]">
              <input
                type="checkbox"
                checked={cfSavePassword}
                onChange={(e) => setCfSavePassword(e.target.checked)}
                className="mt-0.5 accent-[#8b5cf6]"
              />
              <span>
                Simpan password (terenkripsi) supaya sesi yang kedaluwarsa bisa diperbarui
                sendiri. Tanpa ini kamu perlu login ulang di sini tiap kali sesi mati.
              </span>
            </label>
            {cfError && <p role="alert" className="text-[12px] text-[#f87171]">{cfError}</p>}
            <div className="flex flex-wrap justify-between gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={startCodeforcesOAuth}>
                Pakai OAuth
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={() => { setCfModalOpen(false); setCfError(""); }}>
                  Batal
                </Button>
                <Button type="submit" variant="primary" disabled={cfLoading}>
                  {cfLoading ? "Menghubungkan..." : "Hubungkan"}
                </Button>
              </div>
            </div>
          </form>
        </Modal>

        <Modal open={tlxModalOpen} onClose={() => { setTlxModalOpen(false); setTlxError(""); }} title="Hubungkan TLX TOKI">
          <form onSubmit={handleTLXSubmit} className="space-y-4">
            <p className="text-[13px] text-[#a1a1aa]">
              Masukkan username dan password akun TLX kamu.
            </p>
            <div className="space-y-2">
              <label htmlFor={tlxUserId} className="block text-[12px] text-[#a1a1aa]">Username</label>
              <input
                id={tlxUserId}
                type="text"
                value={tlxUsername}
                onChange={(e) => setTlxUsername(e.target.value)}
                placeholder="username TLX"
                required
                autoComplete="username"
                className="w-full bg-[#09090b] border border-[rgba(255,255,255,0.08)] rounded-[6px] px-3 py-2 text-[13px] text-[#e4e4e7] placeholder-[#a1a1aa] focus:outline-none focus:border-[#8b5cf6]"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor={tlxPassId} className="block text-[12px] text-[#a1a1aa]">Password</label>
              <input
                id={tlxPassId}
                type="password"
                value={tlxPassword}
                onChange={(e) => setTlxPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className="w-full bg-[#09090b] border border-[rgba(255,255,255,0.08)] rounded-[6px] px-3 py-2 text-[13px] text-[#e4e4e7] placeholder-[#a1a1aa] focus:outline-none focus:border-[#8b5cf6]"
              />
            </div>
            {tlxError && (
              <p role="alert" className="text-[12px] text-[#f87171]">{tlxError}</p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                onClick={() => { setTlxModalOpen(false); setTlxError(""); }}
              >
                Batal
              </Button>
              <Button type="submit" variant="primary" disabled={tlxLoading}>
                {tlxLoading ? "Menghubungkan..." : "Hubungkan"}
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    </>
  );
}
