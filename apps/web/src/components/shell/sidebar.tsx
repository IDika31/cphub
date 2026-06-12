"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Files,
  ClipboardList,
  Link as LinkIcon,
  Settings,
  Activity,
  Puzzle,
  LogOut,
  ChevronLeft,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/problems", label: "Problemset", icon: Files },
  { href: "/submissions", label: "Submission", icon: ClipboardList },
  { href: "/connections", label: "Connections", icon: LinkIcon },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/status", label: "Status", icon: Activity },
  { href: "/extension", label: "Extension", icon: Puzzle },
];

export default function Sidebar() {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  return (
    <aside className="w-[220px] bg-[#18181b] border-r border-[rgba(255,255,255,0.08)] flex flex-col flex-shrink-0 overflow-hidden">
      {/* Logo */}
      <div className="flex items-center justify-between px-[14px] h-[44px] border-b border-[rgba(255,255,255,0.08)]">
        <span className="text-[16px] font-semibold text-[#8b5cf6]">CPHub</span>
        <button className="text-[#52525b] hover:text-[#e4e4e7] p-1 rounded-[6px] hover:bg-[#1f1f23] transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-[6px] space-y-[1px] overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-[9px] px-[10px] py-[7px] rounded-[6px] text-[13px] transition-colors ${
                active
                  ? "bg-[rgba(139,92,246,0.15)] text-[#8b5cf6] font-medium"
                  : "text-[#71717a] hover:bg-[#1f1f23] hover:text-[#e4e4e7]"
              }`}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Profile + Logout */}
      <div className="border-t border-[rgba(255,255,255,0.08)] p-[6px]">
        {user && (
          <div className="flex items-center gap-[9px] p-[6px_4px] rounded-[8px] cursor-pointer hover:bg-[#1f1f23] mb-[2px]">
            <div className="w-8 h-8 rounded-full bg-[#8b5cf6] text-white text-[11px] font-semibold flex items-center justify-center">
              {user.name?.[0]?.toUpperCase() || "U"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] text-[#e4e4e7] truncate">
                {user.name}
              </div>
              <div className="text-[11px] text-[#52525b] truncate">
                {user.email}
              </div>
            </div>
          </div>
        )}
        <button
          onClick={logout}
          className="flex items-center gap-[7px] w-full p-[6px_4px] text-[12px] text-[#ef4444] hover:bg-[rgba(239,68,68,0.08)] rounded-[6px] transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </button>
      </div>
    </aside>
  );
}
