"use client";

import { useState, useId, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth-store";
import GuestGuard from "@/components/auth/guest-guard";
import Button from "@/components/ui/button";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const emailId = useId();
  const passwordId = useId();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/dashboard";
  const login = useAuthStore((s) => s.login);
  const loginWithGoogle = useAuthStore((s) => s.loginWithGoogle);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(email, password);
      router.push(redirectTo);
    } catch {
      setError("Invalid email or password");
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f0f10] p-4">
      <div className="w-full max-w-[380px] bg-[#18181b] rounded-[12px] border border-[rgba(255,255,255,0.08)] p-[32px]">
        <h1 className="text-[20px] font-semibold text-[#e4e4e7] mb-2">Login</h1>
        <p className="text-[13px] text-[#a1a1aa] mb-6">
          Welcome back to CPHub
        </p>

        {error && (
          <div role="alert" className="mb-4 p-[10px] rounded-[6px] bg-[rgba(239,68,68,0.1)] text-[#f87171] text-[12px]">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor={emailId} className="block text-[12px] font-medium text-[#a1a1aa] mb-1">
              Email
            </label>
            <input
              id={emailId}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-[12px] py-[8px] rounded-[6px] text-[13px] bg-[#1f1f23] border border-[rgba(255,255,255,0.08)] text-[#e4e4e7] placeholder-[#a1a1aa] focus:outline-none focus:border-[#8b5cf6] transition-colors"
              placeholder="you@example.com"
              required
            />
          </div>
          <div>
            <label htmlFor={passwordId} className="block text-[12px] font-medium text-[#a1a1aa] mb-1">
              Password
            </label>
            <input
              id={passwordId}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-[12px] py-[8px] rounded-[6px] text-[13px] bg-[#1f1f23] border border-[rgba(255,255,255,0.08)] text-[#e4e4e7] placeholder-[#a1a1aa] focus:outline-none focus:border-[#8b5cf6] transition-colors"
              placeholder="••••••••"
              required
            />
          </div>
          <Button variant="primary" className="w-full justify-center" disabled={busy}>
            {busy ? "Signing in..." : "Login"}
          </Button>
        </form>

        <div className="my-4 flex items-center gap-3">
          <div className="flex-1 h-px bg-[rgba(255,255,255,0.08)]" />
          <span className="text-[11px] text-[#a1a1aa]">or</span>
          <div className="flex-1 h-px bg-[rgba(255,255,255,0.08)]" />
        </div>

        <Button onClick={loginWithGoogle} className="w-full justify-center">
          Continue with Google
        </Button>

        <p className="mt-6 text-center text-[12px] text-[#a1a1aa]">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="text-[#a78bfa] hover:underline">
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0f0f10]" />}>
      <GuestGuard>
        <LoginForm />
      </GuestGuard>
    </Suspense>
  );
}
