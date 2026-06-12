"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export default function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav className="flex items-center gap-1 text-[12px]">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="w-3 h-3 text-[#52525b]" />}
          {item.href ? (
            <Link
              href={item.href}
              className="text-[#71717a] hover:text-[#e4e4e7] transition-colors"
            >
              {item.label}
            </Link>
          ) : (
            <span className="text-[#e4e4e7]">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
