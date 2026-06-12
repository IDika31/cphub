import Link from "next/link";
import { Code2, BarChart3, Puzzle, Zap, Shield } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0f0f10] text-[#e4e4e7]">
      {/* Nav */}
      <nav className="h-[56px] border-b border-[rgba(255,255,255,0.08)] flex items-center justify-between px-[24px] bg-[#18181b]/50 backdrop-blur">
        <span className="text-[18px] font-semibold text-[#8b5cf6]">CPHub</span>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="px-[14px] py-[6px] rounded-[6px] text-[13px] font-medium text-[#e4e4e7] hover:bg-[#1f1f23] transition-colors"
          >
            Login
          </Link>
          <Link
            href="/register"
            className="px-[14px] py-[6px] rounded-[6px] text-[13px] font-medium bg-[#8b5cf6] text-white hover:bg-[#7c3aed] transition-colors"
          >
            Register
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-[900px] mx-auto pt-[100px] pb-[80px] px-[24px] text-center">
        <div className="inline-flex items-center gap-2 px-[10px] py-[4px] rounded-full text-[11px] font-medium bg-[rgba(139,92,246,0.15)] text-[#8b5cf6] mb-6 border border-[rgba(139,92,246,0.2)]">
          <Zap className="w-3 h-3" /> v4.0 — Local-first
        </div>
        <h1 className="text-[44px] font-bold leading-tight mb-4">
          Competitive Programming{" "}
          <span className="text-[#8b5cf6]">Hub</span>
        </h1>
        <p className="text-[16px] text-[#71717a] max-w-[600px] mx-auto mb-8 leading-relaxed">
          Satu platform untuk semua workflow competitive programming.
          Codeforces, TLX TOKI, editor Monaco, grader native, dan analitik
          — semua berjalan lokal di mesinmu.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link
            href="/register"
            className="px-[20px] py-[10px] rounded-[8px] text-[14px] font-semibold bg-[#8b5cf6] text-white hover:bg-[#7c3aed] transition-colors"
          >
            Mulai Sekarang
          </Link>
          <Link
            href="/login"
            className="px-[20px] py-[10px] rounded-[8px] text-[14px] font-medium bg-[#1f1f23] text-[#e4e4e7] border border-[rgba(255,255,255,0.16)] hover:bg-[#18181b] transition-colors"
          >
            Login
          </Link>
        </div>
      </section>

      {/* Features Grid */}
      <section className="max-w-[900px] mx-auto px-[24px] pb-[80px]">
        <div className="grid grid-cols-3 gap-4">
          {[
            {
              icon: Code2,
              title: "Editor + Grader",
              desc: "Monaco Editor split-view dengan grader native GCC/Python/Node.js. Tanpa Docker.",
            },
            {
              icon: Puzzle,
              title: "Multi-Platform Sync",
              desc: "Browser extension sync problem Codeforces & TLX TOKI ke dashboard lokal.",
            },
            {
              icon: BarChart3,
              title: "Analitik Dashboard",
              desc: "Rating tracker, heatmap kalender, tag weakness analysis — semua real-time.",
            },
            {
              icon: Zap,
              title: "Grader Cepat",
              desc: "Kompilasi native < 200ms. Firejail sandbox isolasi penuh. 5 concurrent execution.",
            },
            {
              icon: Shield,
              title: "Local-First",
              desc: "Semua data di mesinmu. PostgreSQL + Redis native. Tanpa ketergantungan cloud.",
            },
            {
              icon: Puzzle,
              title: "Browser Extension",
              desc: "Satu klik sync dari halaman CF/TLX. Manifest V3, popup UI, keyboard shortcuts.",
            },
          ].map((f, i) => (
            <div
              key={i}
              className="bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-[10px] p-[20px] hover:border-[rgba(139,92,246,0.3)] transition-colors"
            >
              <div className="w-9 h-9 rounded-[8px] bg-[rgba(139,92,246,0.15)] text-[#8b5cf6] flex items-center justify-center mb-3">
                <f.icon className="w-[18px] h-[18px]" />
              </div>
              <h3 className="text-[14px] font-semibold text-[#e4e4e7] mb-1.5">
                {f.title}
              </h3>
              <p className="text-[12px] text-[#71717a] leading-relaxed">
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Tech Stack */}
      <section className="max-w-[900px] mx-auto px-[24px] pb-[80px]">
        <h2 className="text-[20px] font-semibold text-center mb-8">
          Tech Stack
        </h2>
        <div className="flex justify-center gap-6 flex-wrap">
          {[
            "Go + Fiber v2",
            "Next.js 14",
            "TypeScript",
            "TailwindCSS",
            "PostgreSQL 16",
            "Redis 7",
            "GCC 14+",
            "Python 3.12+",
            "Node.js 22+",
            "Java 21+",
            "Firejail",
            "Chrome Ext V3",
          ].map((t) => (
            <span
              key={t}
              className="px-[12px] py-[5px] rounded-full text-[12px] font-medium bg-[#1f1f23] text-[#71717a] border border-[rgba(255,255,255,0.08)]"
            >
              {t}
            </span>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[rgba(255,255,255,0.08)] py-[20px] text-center">
        <p className="text-[12px] text-[#52525b]">
          CPHub V4 · Andika Pratama · Universitas Sam Ratulangi
        </p>
      </footer>
    </div>
  );
}
