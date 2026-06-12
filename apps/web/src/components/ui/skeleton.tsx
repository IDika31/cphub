interface SkeletonProps {
  className?: string;
}

export default function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-[#1f1f23] rounded-[6px] ${className}`}
    />
  );
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-[6px]">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-[6px]">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} className="h-[32px] flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}
