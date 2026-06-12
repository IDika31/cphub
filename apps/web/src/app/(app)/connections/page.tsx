"use client";

import { useState, useEffect } from "react";
import Topbar from "@/components/shell/topbar";
import Button from "@/components/ui/button";
import Badge from "@/components/ui/badge";
import Skeleton from "@/components/ui/skeleton";
import { fetchConnections, unlinkAccount, type LinkedAccount } from "@/lib/api/connections";

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

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetchConnections();
      const accounts = res.data;
      setProviders([
        {
          name: "Codeforces",
          provider: "codeforces",
          connected: accounts.some((a) => a.provider === "codeforces" && a.isConnected),
          account: accounts.find((a) => a.provider === "codeforces") || null,
          description: "Hubungkan akun Codeforces via OAuth untuk sync problem dan submission.",
        },
        {
          name: "TLX TOKI",
          provider: "tlx",
          connected: accounts.some((a) => a.provider === "tlx" && a.isConnected),
          account: accounts.find((a) => a.provider === "tlx") || null,
          description: "Hubungkan akun TLX via browser extension untuk mulai sync problem.",
        },
        {
          name: "Google",
          provider: "google",
          connected: accounts.some((a) => a.provider === "google" && a.isConnected),
          account: accounts.find((a) => a.provider === "google") || null,
          description: "Akun Google digunakan untuk login.",
        },
      ]);
    } catch {
      // keep defaults
    } finally {
      setLoading(false);
    }
  }

  async function handleUnlink(id: string) {
    try {
      await unlinkAccount(id);
      loadData();
    } catch {}
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
                className="bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-[8px] p-[16px] flex items-center gap-4"
              >
                <div
                  className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                    p.connected ? "bg-[#10b981]" : "bg-[#52525b]"
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
                    <p className="text-[12px] text-[#71717a]">
                      {p.account.handle || p.account.provider}
                      {p.account.rating > 0 && ` · Rating: ${p.account.rating} (max ${p.account.maxRating})`}
                    </p>
                  ) : (
                    <p className="text-[12px] text-[#71717a]">{p.description}</p>
                  )}
                </div>
                {p.connected && p.account ? (
                  <Button
                    variant="danger"
                    onClick={() => handleUnlink(p.account!.id)}
                  >
                    Unlink
                  </Button>
                ) : (
                  <Button variant="primary">
                    Link
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
