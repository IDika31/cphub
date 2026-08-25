"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, AlertCircle } from "lucide-react";
import Link from "next/link";
import Topbar from "@/components/shell/topbar";
import Button from "@/components/ui/button";
import { importTLXProblem } from "@/lib/api/tlx";

function ImportInner() {
  const router = useRouter();
  const params = useSearchParams();
  const url = params.get("url") || "";
  const [error, setError] = useState("");

  useEffect(() => {
    if (!url) {
      setError("URL TLX tidak ada di parameter.");
      return;
    }
    let cancelled = false;
    importTLXProblem(url)
      .then((res) => {
        if (!cancelled) router.replace(`/problems/${res.id}`);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError((err as { message?: string })?.message || "Gagal mengimport problem TLX.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [url, router]);

  return (
    <>
      <Topbar title="Import TLX" />
      <div className="flex-1 flex items-center justify-center p-[14px]">
        {error ? (
          <div className="flex flex-col items-center gap-3 text-center max-w-[360px]">
            <div className="w-10 h-10 rounded-full bg-[rgba(239,68,68,0.12)] text-[#ef4444] flex items-center justify-center">
              <AlertCircle className="w-5 h-5" />
            </div>
            <p className="text-[13px] text-[#e4e4e7]">{error}</p>
            {url && <p className="text-[11px] text-[#a1a1aa] break-all">{url}</p>}
            <div className="flex gap-2 mt-1">
              <Link href="/problems"><Button variant="default">Ke Problemset</Button></Link>
              <Link href="/connections"><Button variant="ghost">Cek Connections</Button></Link>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 text-center">
            <Loader2 className="w-6 h-6 text-[#a78bfa] animate-spin" />
            <p className="text-[13px] text-[#a1a1aa]">Mengimport problem dari TLX...</p>
            {url && <p className="text-[11px] text-[#a1a1aa] break-all max-w-[360px]">{url}</p>}
          </div>
        )}
      </div>
    </>
  );
}

export default function ImportTLXPage() {
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center text-[13px] text-[#a1a1aa]">Loading...</div>}>
      <ImportInner />
    </Suspense>
  );
}
