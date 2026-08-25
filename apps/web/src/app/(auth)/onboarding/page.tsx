"use client";

import { useRouter } from "next/navigation";
import { Puzzle, Link, Play } from "lucide-react";
import Button from "@/components/ui/button";

const STEPS = [
  {
    icon: Link,
    title: "Hubungkan akun Codeforces",
    description: "Buka Connections page, klik Link untuk OAuth Codeforces.",
  },
  {
    icon: Puzzle,
    title: "Install browser extension",
    description:
      "Install CPHub extension dari Chrome Web Store atau load unpacked manual.",
  },
  {
    icon: Play,
    title: "Sync problem pertamamu",
    description:
      "Buka soal Codeforces atau TLX di browser, klik Sync — otomatis tersimpan di CPHub.",
  },
];

export default function OnboardingPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f0f10] p-4">
      <div className="w-full max-w-[480px] bg-[#18181b] rounded-[12px] border border-[rgba(255,255,255,0.08)] p-[24px] sm:p-[40px]">
        <h1 className="text-[24px] font-semibold text-[#e4e4e7] mb-2 text-center">
          Selamat Datang di CPHub V4!
        </h1>
        <p className="text-[13px] text-[#a1a1aa] mb-8 text-center">
          Tiga langkah untuk memulai
        </p>

        <div className="space-y-4 mb-8">
          {STEPS.map((step, i) => (
            <div
              key={i}
              className="flex gap-4 p-[16px] rounded-[8px] bg-[#1f1f23] border border-[rgba(255,255,255,0.08)]"
            >
              <div className="w-8 h-8 rounded-full bg-[rgba(139,92,246,0.15)] text-[#a78bfa] flex items-center justify-center flex-shrink-0">
                <step.icon className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-[13px] font-semibold text-[#e4e4e7] mb-1">
                  {i + 1}. {step.title}
                </h3>
                <p className="text-[12px] text-[#a1a1aa]">{step.description}</p>
              </div>
            </div>
          ))}
        </div>

        <Button
          variant="primary"
          className="w-full justify-center"
          onClick={() => router.push("/dashboard")}
        >
          Mulai Dashboard
        </Button>
      </div>
    </div>
  );
}
