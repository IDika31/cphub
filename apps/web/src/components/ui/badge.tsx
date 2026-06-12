type BadgeVariant = "cf" | "difficulty" | "time" | "verdict-ac" | "verdict-wa" | "verdict-tle" | "verdict-ce" | "verdict-re" | "verdict-pending";

const variantStyles: Record<BadgeVariant, string> = {
  cf: "bg-[rgba(59,130,246,0.15)] text-[#60a5fa]",
  difficulty: "bg-[rgba(245,158,11,0.15)] text-[#fbbf24]",
  time: "bg-[#1f1f23] text-[#71717a] border border-[rgba(255,255,255,0.08)]",
  "verdict-ac": "bg-[rgba(16,185,129,0.15)] text-[#34d399]",
  "verdict-wa": "bg-[rgba(239,68,68,0.15)] text-[#ef4444]",
  "verdict-tle": "bg-[rgba(245,158,11,0.15)] text-[#f59e0b]",
  "verdict-ce": "bg-[rgba(139,92,246,0.15)] text-[#8b5cf6]",
  "verdict-re": "bg-[rgba(239,68,68,0.15)] text-[#ef4444]",
  "verdict-pending": "bg-[#1f1f23] text-[#71717a]",
};

interface BadgeProps {
  variant?: BadgeVariant;
  className?: string;
  children: React.ReactNode;
}

export default function Badge({ variant = "time", className = "", children }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-[8px] py-[2px] rounded-full text-[11px] font-medium ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}

export function VerdictBadge({ verdict }: { verdict: string }) {
  const v = `verdict-${verdict.toLowerCase()}` as BadgeVariant;
  return <Badge variant={v}>{verdict}</Badge>;
}
