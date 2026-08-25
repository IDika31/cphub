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
      <div className="text-[#a1a1aa] mb-3">{icon}</div>
      <h3 className="text-[14px] font-semibold text-[#e4e4e7] mb-1">{title}</h3>
      {description && (
        <p className="text-[12px] text-[#a1a1aa] max-w-[320px] mb-4 leading-relaxed">
          {description}
        </p>
      )}
      {action}
    </div>
  );
}
