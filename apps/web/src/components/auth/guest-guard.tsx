"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";

/** Mirror of AuthGuard for pages that only make sense when signed out.
 *  Landing on /login with a live session and having to click through to the
 *  dashboard is pure friction, so an authenticated visitor is sent straight on.
 *  replace() rather than push() so Back does not bounce between the two. */
export default function GuestGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const params = useSearchParams();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);

  // Honour ?redirect= so a deep link that bounced through login still lands
  // where it was headed. Only in-app paths, never an absolute URL — that would
  // turn the login page into an open redirect.
  const raw = params.get("redirect") || "";
  const target = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/dashboard";

  useEffect(() => {
    if (!isLoading && isAuthenticated) router.replace(target);
  }, [isAuthenticated, isLoading, router, target]);

  // Showing the form for a frame and then yanking it away reads as a glitch.
  if (isLoading || isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f0f10]">
        <p className="text-[13px] text-[#a1a1aa] animate-pulse">
          {isAuthenticated ? "Mengalihkan ke dashboard..." : "Memuat..."}
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
