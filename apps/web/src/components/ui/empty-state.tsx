import { ReactNode } from "react";

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-[64px] text-center">
      <div className="text-[#52525b] mb-3">{icon}</div>
      <h3 className="text-[14px] font-semibold text-[#71717a] mb-1">{title}</h3>
      {description && (
        <p className="text-[12px] text-[#52525b] max-w-[300px] mb-4">
          {description}
        </p>
      )}
      {action}
    </div>
  );
}
