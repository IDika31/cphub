"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Files, ClipboardList, Link as LinkIcon,
  Settings, Activity, Puzzle, LogOut, ChevronLeft,
  ChevronDown,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";

interface Provider {
  name: string;
  slug: string;
  connected: boolean;
}

const MOCK_PROVIDERS: Provider[] = [
  { name: "Codeforces", slug: "codeforces", connected: true },
  { name: "TLX TOKI", slug: "tlx", connected: false },
];

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  hasSubmenu?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/problems", label: "Problemset", icon: Files, hasSubmenu: true },
  { href: "/submissions", label: "Submission", icon: ClipboardList, hasSubmenu: true },
  { href: "/connections", label: "Connections", icon: LinkIcon },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/status", label: "Status", icon: Activity },
  { href: "/extension", label: "Extension", icon: Puzzle },
];

export default function Sidebar() {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set(["problems"]));

  function toggleMenu(href: string) {
    setExpandedMenus((prev) => {
      const next = new Set(prev);
      if (next.has(href)) next.delete(href);
      else next.add(href);
      return next;
    });
  }

  const connectedProviders = MOCK_PROVIDERS.filter((p) => p.connected);

  return (
    <aside className="w-[220px] bg-[#18181b] border-r border-[rgba(255,255,255,0.08)] flex flex-col flex-shrink-0 overflow-hidden">
      <div className="flex items-center justify-between px-[14px] h-[44px] border-b border-[rgba(255,255,255,0.08)]">
        <span className="text-[16px] font-semibold text-[#8b5cf6]">CPHub</span>
        <button className="text-[#52525b] hover:text-[#e4e4e7] p-1 rounded-[6px] hover:bg-[#1f1f23]">
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      <nav className="flex-1 p-[6px] space-y-[1px] overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          const isExpanded = expandedMenus.has(item.href);

          return (
            <div key={item.href}>
              <Link
                href={item.href}
                onClick={(e) => {
                  if (item.hasSubmenu) {
                    e.preventDefault();
                    toggleMenu(item.href);
                  }
                }}
                className={`flex items-center gap-[9px] px-[10px] py-[7px] rounded-[6px] text-[13px] transition-colors ${
                  active
                    ? "bg-[rgba(139,92,246,0.15)] text-[#8b5cf6] font-medium"
                    : "text-[#71717a] hover:bg-[#1f1f23] hover:text-[#e4e4e7]"
                }`}
              >
                <item.icon className="w-4 h-4" />
                <span className="flex-1">{item.label}</span>
                {item.hasSubmenu && (
                  <ChevronDown
                    className={`w-3 h-3 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                  />
                )}
              </Link>

              {/* Submenu — provider-based */}
              {item.hasSubmenu && isExpanded && connectedProviders.length > 0 && (
                <div className="ml-[37px] mt-[1px] space-y-[1px]">
                  <Link
                    href={item.href}
                    className={`block px-[10px] py-[5px] rounded-[6px] text-[12px] transition-colors ${
                      pathname === item.href
                        ? "text-[#8b5cf6]"
                        : "text-[#71717a] hover:text-[#e4e4e7]"
                    }`}
                  >
                    Semua
                  </Link>
                  {connectedProviders.map((p) => (
                    <Link
                      key={p.slug}
                      href={`${item.href}?provider=${p.slug}`}
                      className={`block px-[10px] py-[5px] rounded-[6px] text-[12px] transition-colors ${
                        pathname.includes(p.slug)
                          ? "text-[#8b5cf6]"
                          : "text-[#71717a] hover:text-[#e4e4e7]"
                      }`}
                    >
                      {p.name}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-[rgba(255,255,255,0.08)] p-[6px]">
        {user && (
          <div className="flex items-center gap-[9px] p-[6px_4px] rounded-[8px] cursor-pointer hover:bg-[#1f1f23] mb-[2px]">
            <div className="w-8 h-8 rounded-full bg-[#8b5cf6] text-white text-[11px] font-semibold flex items-center justify-center">
              {user.name?.[0]?.toUpperCase() || "U"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] text-[#e4e4e7] truncate">{user.name}</div>
              <div className="text-[11px] text-[#52525b] truncate">{user.email}</div>
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
