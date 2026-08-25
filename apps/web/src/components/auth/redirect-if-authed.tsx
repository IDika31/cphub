"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";

/** Drop-in for pages that should hand an already-signed-in visitor straight to
 *  the app. Renders nothing, so the page it sits on still paints normally for
 *  guests instead of being gated behind an auth check. */
export default function RedirectIfAuthed({ to = "/dashboard" }: { to?: string }) {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);

  useEffect(() => {
    if (!isLoading && isAuthenticated) router.replace(to);
  }, [isAuthenticated, isLoading, router, to]);

  return null;
}
