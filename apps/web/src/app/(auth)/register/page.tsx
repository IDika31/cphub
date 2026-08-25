"use client";

import { useState, useId, Suspense } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth-store";
import GuestGuard from "@/components/auth/guest-guard";
import Button from "@/components/ui/button";

function RegisterForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const nameId = useId();
  const emailId = useId();
  const passwordId = useId();
  const hintId = useId();
  const router = useRouter();
  const register = useAuthStore((s) => s.register);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setBusy(true);
    try {
      await register(name, email, password);
      router.push("/onboarding");
    } catch {
      setError("Registration failed. Email may already be in use.");
      setBusy(false);
    }
  };

  const inputClass =
    "w-full px-[12px] py-[8px] rounded-[6px] text-[13px] bg-[#1f1f23] border border-[rgba(255,255,255,0.08)] text-[#e4e4e7] placeholder-[#a1a1aa] focus:outline-none focus:border-[#8b5cf6] transition-colors";
  const labelClass = "block text-[12px] font-medium text-[#a1a1aa] mb-1";

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f0f10] p-4">
      <div className="w-full max-w-[380px] bg-[#18181b] rounded-[12px] border border-[rgba(255,255,255,0.08)] p-[32px]">
        <h1 className="text-[20px] font-semibold text-[#e4e4e7] mb-2">
          Register
        </h1>
        <p className="text-[13px] text-[#a1a1aa] mb-6">
          Create your CPHub account
        </p>

        {error && (
          <div role="alert" className="mb-4 p-[10px] rounded-[6px] bg-[rgba(239,68,68,0.1)] text-[#f87171] text-[12px]">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor={nameId} className={labelClass}>Name</label>
            <input
              id={nameId}
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              placeholder="Andika Pratama"
              required
            />
          </div>
          <div>
            <label htmlFor={emailId} className={labelClass}>Email</label>
            <input
              id={emailId}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              placeholder="you@example.com"
              required
            />
          </div>
          <div>
            <label htmlFor={passwordId} className={labelClass}>Password</label>
            <input
              id={passwordId}
              type="password"
              autoComplete="new-password"
              minLength={8}
              aria-describedby={hintId}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              placeholder="••••••••"
              required
            />
            <p id={hintId} className="text-[11px] text-[#a1a1aa] mt-1">
              Minimal 8 karakter.
            </p>
          </div>
          <Button variant="primary" className="w-full justify-center" disabled={busy}>
            {busy ? "Creating account..." : "Register"}
          </Button>
        </form>

        <p className="mt-6 text-center text-[12px] text-[#a1a1aa]">
          Already have an account?{" "}
          <Link href="/login" className="text-[#a78bfa] hover:underline">
            Login
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0f0f10]" />}>
      <GuestGuard>
        <RegisterForm />
      </GuestGuard>
    </Suspense>
  );
}
