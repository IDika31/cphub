# 02 — Frontend: Next.js Web App (`apps/web/`)

> **Status:** ⬜ (0/60)

---

## 2.1 Foundation

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| WEB-01 | Init Next.js 14 project (Bun) | ⬜ | `apps/web/package.json` |
| WEB-02 | TailwindCSS config — dark/light palette, fonts | ⬜ | `apps/web/tailwind.config.ts` |
| WEB-03 | TypeScript strict config | ⬜ | `apps/web/tsconfig.json` |
| WEB-04 | `globals.css` — scrollbar, animations | ⬜ | `apps/web/src/app/globals.css` |
| WEB-05 | Root layout — ThemeProvider (next-themes, `attribute="class"`, `defaultTheme="dark"`) | ⬜ | `apps/web/src/app/layout.tsx` |
| WEB-06 | Zustand store setup (auth, settings, grader, problems) | ⬜ | `apps/web/src/stores/` |

## 2.2 Auth Pages — (auth) Route Group (no shell)

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| FE-AUTH-01 | Login page — email/password form + Google OAuth button | ⬜ | `apps/web/src/app/(auth)/login/page.tsx` |
| FE-AUTH-02 | Register page — email/password/confirm form + Google OAuth | ⬜ | `apps/web/src/app/(auth)/register/page.tsx` |
| FE-AUTH-03 | Auth form components (Input, Button, Divider) | ⬜ | `apps/web/src/components/auth/` |
| FE-AUTH-04 | Auth API client (login, register, refresh, logout) | ⬜ | `apps/web/src/lib/api/auth.ts` |

## 2.3 Onboarding Page

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| FE-ONB-01 | Onboarding centered card — 3 step guide | ⬜ | `apps/web/src/app/(auth)/onboarding/page.tsx` |
| FE-ONB-02 | "Mulai Dashboard" CTA button | ⬜ | `apps/web/src/app/(auth)/onboarding/page.tsx` |

## 2.4 App Shell — Sidebar + Topbar

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| FE-SHELL-01 | App layout — sidebar + topbar + content area | ⬜ | `apps/web/src/app/(app)/layout.tsx` |
| FE-SHELL-02 | Sidebar component (220px, nav items, submenu, profile, logout) | ⬜ | `apps/web/src/components/shell/sidebar.tsx` |
| FE-SHELL-03 | Topbar component (44px, title, actions, badges) | ⬜ | `apps/web/src/components/shell/topbar.tsx` |
| FE-SHELL-04 | Sidebar dynamic submenu — provider-based (CF, TLX) | ⬜ | `apps/web/src/components/shell/sidebar.tsx` |
| FE-SHELL-05 | Mobile responsive — collapsible sidebar, hamburger | ⬜ | `apps/web/src/components/shell/sidebar.tsx` |
| FE-SHELL-06 | Breadcrumb component | ⬜ | `apps/web/src/components/ui/breadcrumb.tsx` |

## 2.5 UI Components (Shared)

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| FE-UI-01 | Button — default, primary, ghost, danger variants | ⬜ | `apps/web/src/components/ui/button.tsx` |
| FE-UI-02 | Select dropdown | ⬜ | `apps/web/src/components/ui/select.tsx` |
| FE-UI-03 | Badge — provider, difficulty, verdict, time | ⬜ | `apps/web/src/components/ui/badge.tsx` |
| FE-UI-04 | Kbd shortcut indicator | ⬜ | `apps/web/src/components/ui/kbd.tsx` |
| FE-UI-05 | Skeleton loader | ⬜ | `apps/web/src/components/ui/skeleton.tsx` |
| FE-UI-06 | Empty state component | ⬜ | `apps/web/src/components/ui/empty-state.tsx` |
| FE-UI-07 | Toast / notification | ⬜ | `apps/web/src/components/ui/toast.tsx` |
| FE-UI-08 | Modal / dialog | ⬜ | `apps/web/src/components/ui/modal.tsx` |
| FE-UI-09 | Theme toggle button (dark/light) | ⬜ | `apps/web/src/components/ui/theme-toggle.tsx` |

## 2.6 Dashboard Page

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| FE-DASH-01 | Overview stat cards (Solved, Streak, Accuracy) | ⬜ | `apps/web/src/app/(app)/dashboard/page.tsx` |
| FE-DASH-02 | Rating chart (line chart) | ⬜ | `apps/web/src/components/dashboard/rating-chart.tsx` |
| FE-DASH-03 | Activity heatmap (calendar grid) | ⬜ | `apps/web/src/components/dashboard/heatmap.tsx` |
| FE-DASH-04 | Tag weakness table | ⬜ | `apps/web/src/components/dashboard/tag-weakness.tsx` |
| FE-DASH-05 | Dashboard API client | ⬜ | `apps/web/src/lib/api/dashboard.ts` |

## 2.7 Problemset Page

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| FE-PROB-01 | Problemset list page — filter bar + table | ⬜ | `apps/web/src/app/(app)/problems/page.tsx` |
| FE-PROB-02 | Filter pills (provider, tag, difficulty, status) | ⬜ | `apps/web/src/components/problemset/filter-bar.tsx` |
| FE-PROB-03 | Search input (full-text) | ⬜ | `apps/web/src/components/problemset/search-input.tsx` |
| FE-PROB-04 | Problems table component | ⬜ | `apps/web/src/components/problemset/problem-table.tsx` |
| FE-PROB-05 | Problemset API client | ⬜ | `apps/web/src/lib/api/problems.ts` |

## 2.8 Problem Detail Page — Split Pane Editor

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| FE-EDIT-01 | Split pane layout — statement (kiri, 42%) + editor/grader (kanan, 58%) | ⬜ | `apps/web/src/app/(app)/problems/[id]/page.tsx` |
| FE-EDIT-02 | Statement panel — problem text, I/O, constraints (KaTeX render) | ⬜ | `apps/web/src/components/editor/statement-panel.tsx` |
| FE-EDIT-03 | Monaco Editor — dynamic import, client-side only | ⬜ | `apps/web/src/components/editor/monaco-editor.tsx` |
| FE-EDIT-04 | Language selector dropdown (C++17, C++20, Python, Java, JS) | ⬜ | `apps/web/src/components/editor/language-select.tsx` |
| FE-EDIT-05 | Template engine — `{cursor}`, `{problem_name}` substitution | ⬜ | `apps/web/src/lib/template.ts` |
| FE-EDIT-06 | Auto-save — 300ms debounce ke localStorage | ⬜ | `apps/web/src/lib/auto-save.ts` |
| FE-EDIT-07 | Resize handle — horizontal (statement/editor), vertical (editor/grader) | ⬜ | `apps/web/src/components/editor/resize-handle.tsx` |
| FE-EDIT-08 | Topbar actions — Run, Submit, Template, Reset, Theme buttons | ⬜ | `apps/web/src/components/editor/editor-topbar.tsx` |

## 2.9 Grader Panel (inside Problem Detail)

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| FE-GRD-01 | Grader tab — run result, verdict badge, runtime, memory | ⬜ | `apps/web/src/components/grader/grader-panel.tsx` |
| FE-GRD-02 | Test Cases tab — sample + custom list | ⬜ | `apps/web/src/components/grader/test-case-manager.tsx` |
| FE-GRD-03 | Diff viewer — expected vs actual output | ⬜ | `apps/web/src/components/grader/diff-viewer.tsx` |
| FE-GRD-04 | Verdict badge component (AC/WA/TLE/RE/CE) | ⬜ | `apps/web/src/components/grader/verdict-badge.tsx` |
| FE-GRD-05 | Run button + keyboard shortcut (Ctrl+Enter) | ⬜ | `apps/web/src/components/grader/run-button.tsx` |
| FE-GRD-06 | WebSocket client — real-time grader result | ⬜ | `apps/web/src/lib/grader-ws.ts` |
| FE-GRD-07 | Grader API client | ⬜ | `apps/web/src/lib/api/grader.ts` |
| FE-GRD-08 | Custom test case editor — add/edit/delete | ⬜ | `apps/web/src/components/grader/test-case-editor.tsx` |
| FE-GRD-09 | Test case import/export JSON | ⬜ | `apps/web/src/components/grader/test-case-manager.tsx` |

## 2.10 Submissions Page

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| FE-SUB-01 | Submission list page — table + filter | ⬜ | `apps/web/src/app/(app)/submissions/page.tsx` |
| FE-SUB-02 | Submission table (problem, verdict, lang, OJ, runtime, memory) | ⬜ | `apps/web/src/components/submissions/submission-table.tsx` |
| FE-SUB-03 | Provider filter dropdown | ⬜ | `apps/web/src/components/submissions/provider-filter.tsx` |
| FE-SUB-04 | Submissions API client | ⬜ | `apps/web/src/lib/api/submissions.ts` |

## 2.11 Connections Page

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| FE-CONN-01 | Connections page — provider card list | ⬜ | `apps/web/src/app/(app)/connections/page.tsx` |
| FE-CONN-02 | Provider card — CF (status, username, rating, link/unlink) | ⬜ | `apps/web/src/components/connections/provider-card.tsx` |
| FE-CONN-03 | Provider card — TLX (status, link via extension) | ⬜ | `apps/web/src/components/connections/provider-card.tsx` |
| FE-CONN-04 | Provider card — Google (status, email, unlink) | ⬜ | `apps/web/src/components/connections/provider-card.tsx` |
| FE-CONN-05 | Connections API client | ⬜ | `apps/web/src/lib/api/connections.ts` |

## 2.12 Settings Page

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| FE-SET-01 | Settings page layout — sections | ⬜ | `apps/web/src/app/(app)/settings/page.tsx` |
| FE-SET-02 | Language dropdown selector | ⬜ | `apps/web/src/components/settings/language-select.tsx` |
| FE-SET-03 | Template editor — small Monaco per language | ⬜ | `apps/web/src/components/settings/template-editor.tsx` |
| FE-SET-04 | Preference toggles (auto-sync, theme) | ⬜ | `apps/web/src/components/settings/preference-toggles.tsx` |
| FE-SET-05 | Save button + API call | ⬜ | `apps/web/src/components/settings/save-button.tsx` |
| FE-SET-06 | Settings API client | ⬜ | `apps/web/src/lib/api/settings.ts` |

## 2.13 Status Page

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| FE-STAT-01 | Status page — overall indicator + component cards | ⬜ | `apps/web/src/app/(app)/status/page.tsx` |
| FE-STAT-02 | Health card component (name, status dot, latency, detail) | ⬜ | `apps/web/src/components/status/health-card.tsx` |
| FE-STAT-03 | Refresh button + auto-poll (30s) | ⬜ | `apps/web/src/components/status/refresh-button.tsx` |
| FE-STAT-04 | Status API client | ⬜ | `apps/web/src/lib/api/status.ts` |

## 2.14 Extension Page

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| FE-EXT-01 | Extension install guide card | ⬜ | `apps/web/src/app/(app)/extension/page.tsx` |
| FE-EXT-02 | Extension status display (version, connected) | ⬜ | `apps/web/src/components/extension/extension-status.tsx` |
| FE-EXT-03 | Extension API client | ⬜ | `apps/web/src/lib/api/extension.ts` |
