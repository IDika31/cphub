"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import Button from "@/components/ui/button";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/dashboard";
  const login = useAuthStore((s) => s.login);
  const loginWithGoogle = useAuthStore((s) => s.loginWithGoogle);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await login(email, password);
      router.push(redirectTo);
    } catch {
      setError("Invalid email or password");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f0f10]">
      <div className="w-full max-w-[380px] bg-[#18181b] rounded-[12px] border border-[rgba(255,255,255,0.08)] p-[32px]">
        <h1 className="text-[20px] font-semibold text-[#e4e4e7] mb-2">Login</h1>
        <p className="text-[13px] text-[#71717a] mb-6">
          Welcome back to CPHub
        </p>

        {error && (
          <div className="mb-4 p-[10px] rounded-[6px] bg-[rgba(239,68,68,0.1)] text-[#ef4444] text-[12px]">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[12px] font-medium text-[#71717a] mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-[12px] py-[8px] rounded-[6px] text-[13px] bg-[#1f1f23] border border-[rgba(255,255,255,0.08)] text-[#e4e4e7] placeholder-[#52525b] focus:outline-none focus:border-[#8b5cf6] transition-colors"
              placeholder="you@example.com"
              required
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-[#71717a] mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-[12px] py-[8px] rounded-[6px] text-[13px] bg-[#1f1f23] border border-[rgba(255,255,255,0.08)] text-[#e4e4e7] placeholder-[#52525b] focus:outline-none focus:border-[#8b5cf6] transition-colors"
              placeholder="••••••••"
              required
            />
          </div>
          <Button variant="primary" className="w-full justify-center">
            Login
          </Button>
        </form>

        <div className="my-4 flex items-center gap-3">
          <div className="flex-1 h-px bg-[rgba(255,255,255,0.08)]" />
          <span className="text-[11px] text-[#52525b]">or</span>
          <div className="flex-1 h-px bg-[rgba(255,255,255,0.08)]" />
        </div>

        <Button onClick={loginWithGoogle} className="w-full justify-center">
          Continue with Google
        </Button>

        <p className="mt-6 text-center text-[12px] text-[#71717a]">
          Don&apos;t have an account?{" "}
          <a href="/register" className="text-[#8b5cf6] hover:underline">
            Register
          </a>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0f0f10]" />}>
      <LoginForm />
    </Suspense>
  );
}
