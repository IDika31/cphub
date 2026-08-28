"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  LayoutDashboard, Files, ClipboardList, Link as LinkIcon,
  Settings, Activity, Puzzle, LogOut, ChevronLeft, ChevronDown, Plus, Trophy, ShieldAlert,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { fetchConnections, type LinkedAccount } from "@/lib/api/connections";
import { fetchCFSessionStatus, CF_SESSION_EVENT } from "@/lib/api/codeforces";
import { cfSessionStatusViaExtension } from "@/lib/extension-bridge";
import { judgeNavEntries } from "@/lib/providers";
import ImportTLXModal from "@/components/tlx/ImportTLXModal";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  hasSubmenu?: boolean;
}

// Only shown while it has something to do — see the cfSession effect below. It sits
// between Contest and Submission because those two are what a dead session breaks.
//
// Reachable by URL whether or not the entry is there, and linked from the Codeforces
// row in Connections, so hiding it never means hiding the way back.
const VERIFY_CF_ITEM: NavItem = {
  href: "/verify-codeforces",
  label: "Verifikasi CF",
  icon: ShieldAlert,
};

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/problems", label: "Problemset", icon: Files, hasSubmenu: true },
  { href: "/contests", label: "Contest", icon: Trophy },
  { href: "/submissions", label: "Submission", icon: ClipboardList, hasSubmenu: true },
  { href: "/connections", label: "Connections", icon: LinkIcon },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/status", label: "Status", icon: Activity },
  { href: "/extension", label: "Extension", icon: Puzzle },
];

interface SidebarProps {
  /** Mobile drawer: dismiss after a navigation so the panel stops covering the page. */
  onNavigate?: () => void;
}

function SidebarInner({ onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const providerParam = searchParams.get("provider") || "";
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  // Keyed by href, matching toggleMenu. The old initial value was "problems"
  // (no slash), which never matched, so the section it meant to open stayed shut.
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(
    () => new Set(NAV_ITEMS.filter((i) => i.hasSubmenu).map((i) => i.href)),
  );
  const [providers, setProviders] = useState<LinkedAccount[]>([]);
  // null until the first answer, so the entry never flashes into view and out again
  // for a user whose session is perfectly fine.
  const [cfNeedsVerify, setCfNeedsVerify] = useState(false);
  const [importTLXOpen, setImportTLXOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem("cphub_sidebar_collapsed") === "1");
  }, []);

  useEffect(() => {
    fetchConnections()
      .then((res) => setProviders(res.data.filter((a) => a.isConnected)))
      .catch(() => {});
  }, []);

  // The verification entry appears while a linked Codeforces account has no usable
  // session, and disappears the moment it has one. Read on every navigation because
  // that is when a stale answer would be visible, and it costs one indexed row:
  // GET /api/cf/session answers from what the server already recorded.
  //
  // Two questions, because neither answers the whole thing:
  //
  //   - the server knows whether IT was refused. That flag only moves when something
  //     tried to use the session, so a session that expired while nothing did still
  //     reads as fine — which is exactly the case where this entry has to appear.
  //   - this browser holds the cookie that actually proves a login. Asking the
  //     extension for it is one cookie read: no tab, no request to Codeforces.
  //
  // So the entry shows when either says no, and the browser is only consulted when
  // the server is satisfied — there is nothing to add once it already said no.
  //
  // Re-read on CF_SESSION_EVENT too, so finishing a verification empties the sidebar
  // without waiting for the next click.
  useEffect(() => {
    let cancelled = false;
    const read = () => {
      fetchCFSessionStatus()
        .then(async (status) => {
          if (cancelled) return;
          if (!status.linked) {
            // Nothing to verify, and nothing to nag a TLX-only user about.
            setCfNeedsVerify(false);
            return;
          }
          if (!status.valid) {
            setCfNeedsVerify(true);
            return;
          }
          try {
            const browser = await cfSessionStatusViaExtension();
            if (!cancelled) setCfNeedsVerify(!browser.loggedIn);
          } catch {
            // No extension in this browser, so the server's verdict is all there is.
            if (!cancelled) setCfNeedsVerify(false);
          }
        })
        .catch(() => {
          // An unreachable API is not evidence the session died.
        });
    };
    read();
    window.addEventListener(CF_SESSION_EVENT, read);
    return () => {
      cancelled = true;
      window.removeEventListener(CF_SESSION_EVENT, read);
    };
  }, [pathname]);

  const navItems = useMemo(() => {
    if (!cfNeedsVerify) return NAV_ITEMS;
    const at = NAV_ITEMS.findIndex((i) => i.href === "/submissions");
    const insertAt = at === -1 ? NAV_ITEMS.length : at;
    return [...NAV_ITEMS.slice(0, insertAt), VERIFY_CF_ITEM, ...NAV_ITEMS.slice(insertAt)];
  }, [cfNeedsVerify]);

  // The label used to be an inline ternary that fell through to the raw provider
  // string, so a self-hosted instance appeared in the nav as the literal
  // "tlx-custom" instead of whatever the user named it.
  const judges = useMemo(() => judgeNavEntries(providers), [providers]);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("cphub_sidebar_collapsed", next ? "1" : "0");
      return next;
    });
  }

  function toggleMenu(href: string) {
    setExpandedMenus((prev) => {
      const next = new Set(prev);
      if (next.has(href)) next.delete(href);
      else next.add(href);
      return next;
    });
  }

  return (
    <aside className={`${collapsed ? "w-[56px]" : "w-[220px]"} bg-[#18181b] border-r border-[rgba(255,255,255,0.08)] flex flex-col flex-shrink-0 overflow-hidden transition-[width] duration-200`}>
      <div className="flex items-center justify-between px-[14px] h-[44px] border-b border-[rgba(255,255,255,0.08)]">
        {!collapsed ? (
          <Link href="/dashboard" onClick={onNavigate} className="flex items-center gap-2">
            {/* Served from public/, so the path resolves — src/app/icon.png is
                only wired up as the favicon and 404s as a plain src. Unoptimized
                because the server has no sharp and a 24px icon has nothing to
                gain from the optimizer. */}
            <Image src="/icon.png" alt="" aria-hidden="true" width={24} height={24} unoptimized className="w-6 h-6 rounded-[6px]" />
            <span className="text-[16px] font-semibold text-[#a78bfa]">CPHub</span>
          </Link>
        ) : (
          <Image src="/icon.png" alt="CPHub" width={24} height={24} unoptimized className="w-6 h-6 rounded-[6px] mx-auto" />
        )}
        <button
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Perluas sidebar" : "Ciutkan sidebar"}
          aria-expanded={!collapsed}
          title={collapsed ? "Perluas" : "Ciutkan"}
          className={`text-[#a1a1aa] hover:text-[#e4e4e7] p-1 rounded-[6px] hover:bg-[#1f1f23] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] ${collapsed ? "mx-auto" : ""}`}
        >
          <ChevronLeft className={`w-4 h-4 transition-transform ${collapsed ? "rotate-180" : ""}`} />
        </button>
      </div>

      <nav className="flex-1 p-[6px] space-y-[1px] overflow-y-auto" aria-label="Navigasi utama">
        {navItems.map((item) => {
          const active = pathname.startsWith(item.href);
          const isExpanded = expandedMenus.has(item.href);

          return (
            <div key={item.href}>
              {/* The label navigates and the chevron discloses. They used to be
                  one control that called preventDefault(), so clicking
                  "Problemset" or "Submission" only opened the submenu — the
                  pages themselves were unreachable from the nav. */}
              <div className={`flex items-center gap-[2px] ${collapsed ? "justify-center" : ""}`}>
                <Link
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  aria-current={active ? "page" : undefined}
                  onClick={() => onNavigate?.()}
                  className={`flex items-center gap-[9px] px-[10px] py-[7px] rounded-[6px] text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] ${collapsed ? "justify-center" : "flex-1 min-w-0"} ${
                    active
                      ? "bg-[rgba(139,92,246,0.15)] text-[#a78bfa] font-medium"
                      : "text-[#a1a1aa] hover:bg-[#1f1f23] hover:text-[#e4e4e7]"
                  }`}
                >
                  <item.icon className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                  {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                </Link>
                {!collapsed && item.hasSubmenu && (
                  <button
                    type="button"
                    onClick={() => toggleMenu(item.href)}
                    aria-expanded={isExpanded}
                    aria-label={`${isExpanded ? "Tutup" : "Buka"} submenu ${item.label}`}
                    className="p-[6px] rounded-[6px] text-[#a1a1aa] hover:bg-[#1f1f23] hover:text-[#e4e4e7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]"
                  >
                    <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                  </button>
                )}
              </div>

              {!collapsed && item.hasSubmenu && isExpanded && (
                <div className="ml-[37px] mt-[1px] space-y-[1px]">
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={`block px-[10px] py-[5px] rounded-[6px] text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] ${
                      pathname === item.href && !providerParam ? "text-[#a78bfa]" : "text-[#a1a1aa] hover:text-[#e4e4e7]"
                    }`}
                  >
                    Semua
                  </Link>
                  {judges.map((j) => (
                    <div key={j.provider} className="flex items-center group">
                      <Link
                        href={`${item.href}?provider=${j.provider}`}
                        onClick={onNavigate}
                        className={`flex-1 block px-[10px] py-[5px] rounded-[6px] text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] ${
                          pathname.startsWith(item.href) && providerParam === j.provider ? "text-[#a78bfa]" : "text-[#a1a1aa] hover:text-[#e4e4e7]"
                        }`}
                      >
                        {j.label}
                      </Link>
                      {j.provider === "tlx" && item.href === "/problems" && (
                        <button
                          onClick={() => setImportTLXOpen(true)}
                          aria-label="Import TLX Problem"
                          title="Import TLX Problem"
                          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 p-[3px] rounded text-[#a1a1aa] hover:text-[#a78bfa] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-[rgba(255,255,255,0.08)] p-[6px]">
        {user && (
          <div className={`flex items-center gap-[9px] p-[6px_4px] rounded-[8px] cursor-pointer hover:bg-[#1f1f23] mb-[2px] ${collapsed ? "justify-center" : ""}`} title={collapsed ? (user.name || user.email) : undefined}>
            <div className="w-8 h-8 rounded-full bg-[#7c3aed] text-white text-[11px] font-semibold flex items-center justify-center flex-shrink-0">
              {user.name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || "U"}
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <div className="text-[12px] text-[#e4e4e7] truncate">{user.name || user.email}</div>
                <div className="text-[11px] text-[#a1a1aa] truncate">{user.email}</div>
              </div>
            )}
          </div>
        )}
        <button
          onClick={logout}
          aria-label="Logout"
          title={collapsed ? "Logout" : undefined}
          className={`flex items-center gap-[7px] w-full p-[6px_4px] text-[12px] text-[#ef4444] hover:bg-[rgba(239,68,68,0.08)] rounded-[6px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ef4444] ${collapsed ? "justify-center" : ""}`}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!collapsed && "Logout"}
        </button>
      </div>

      <ImportTLXModal
        open={importTLXOpen}
        onClose={() => setImportTLXOpen(false)}
        onSuccess={(id) => router.push(`/problems/${id}`)}
      />
    </aside>
  );
}

export default function Sidebar({ onNavigate }: SidebarProps = {}) {
  return (
    <Suspense fallback={<div className="w-[220px] bg-[#18181b]" />}>
      <SidebarInner onNavigate={onNavigate} />
    </Suspense>
  );
}
