"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import Button from "@/components/ui/button";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  const register = useAuthStore((s) => s.register);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    try {
      await register(name, email, password);
      router.push("/onboarding");
    } catch {
      setError("Registration failed. Email may already be in use.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f0f10]">
      <div className="w-full max-w-[380px] bg-[#18181b] rounded-[12px] border border-[rgba(255,255,255,0.08)] p-[32px]">
        <h1 className="text-[20px] font-semibold text-[#e4e4e7] mb-2">
          Register
        </h1>
        <p className="text-[13px] text-[#71717a] mb-6">
          Create your CPHub account
        </p>

        {error && (
          <div className="mb-4 p-[10px] rounded-[6px] bg-[rgba(239,68,68,0.1)] text-[#ef4444] text-[12px]">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[12px] font-medium text-[#71717a] mb-1">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-[12px] py-[8px] rounded-[6px] text-[13px] bg-[#1f1f23] border border-[rgba(255,255,255,0.08)] text-[#e4e4e7] placeholder-[#52525b] focus:outline-none focus:border-[#8b5cf6] transition-colors"
              placeholder="Andika Pratama"
              required
            />
          </div>
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
              placeholder="Min. 8 characters"
              required
            />
          </div>
          <Button variant="primary" className="w-full justify-center">
            Register
          </Button>
        </form>

        <p className="mt-6 text-center text-[12px] text-[#71717a]">
          Already have an account?{" "}
          <a href="/login" className="text-[#8b5cf6] hover:underline">
            Login
          </a>
        </p>
      </div>
    </div>
  );
}
