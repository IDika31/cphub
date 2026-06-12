# CPHub V4 — Implementation Plan

> **Sumber:** PRD.md v4.0.0 (2026-06-12)
> **Repo:** Competitive Hub V4
> **Stack:** Go (Fiber v2) + Next.js 14 (Bun) + PostgreSQL 16 + Redis 7 + Browser Extension (Vite)
> **Status:** Planning — belum ada kode

---

## Status Tracking

| Simbol | Arti |
|--------|------|
| ⬜ | Not started |
| 🔵 | In progress |
| ✅ | Done |
| ⏳ | Blocked |
| ❌ | Skipped / Out of scope |

---

## 0. Monorepo Setup & Infrastructure

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| INF-01 | Init `package.json` root workspace (Bun) | ⬜ | `package.json` |
| INF-02 | Docker Compose — PostgreSQL 16 + Redis 7 (no Piston) | ⬜ | `docker-compose.yml` |
| INF-03 | `.env.example` template | ⬜ | `.env.example` |
| INF-04 | `.gitignore` (Go, Next.js, Docker, IDE) | ⬜ | `.gitignore` |
| INF-05 | `README.md` — setup guide | ⬜ | `README.md` |
| INF-06 | Firejail profile kustom | ⬜ | `/etc/firejail/cphub.local` |
| INF-07 | System limits config (`cphub.conf`) | ⬜ | `/etc/security/limits.d/cphub.conf` |

---

## 1. Backend — Go API (`apps/api/`)

### 1.1 Foundation

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| API-01 | Init Go module | ⬜ | `apps/api/go.mod` |
| API-02 | Config loader (.env, struct) | ⬜ | `apps/api/internal/config/` |
| API-03 | Database connection + health check (GORM + PostgreSQL) | ⬜ | `apps/api/internal/database/` |
| API-04 | Redis connection + health check | ⬜ | `apps/api/internal/database/redis.go` |
| API-05 | Migration runner (golang-migrate) | ⬜ | `apps/api/cmd/migrate.go` |
| API-06 | Fiber server setup + graceful shutdown | ⬜ | `apps/api/internal/server/` |
| API-07 | `main.go` entrypoint | ⬜ | `apps/api/cmd/main.go` |

### 1.2 Database — Models & Migrations

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| DB-01 | User model + migration | ⬜ | `apps/api/internal/model/user.go` |
| DB-02 | LinkedAccount model + migration | ⬜ | `apps/api/internal/model/linked_account.go` |
| DB-03 | Problem model + migration | ⬜ | `apps/api/internal/model/problem.go` |
| DB-04 | TestCase model + migration | ⬜ | `apps/api/internal/model/test_case.go` |
| DB-05 | ProblemLog model + migration | ⬜ | `apps/api/internal/model/problem_log.go` |
| DB-06 | LocalSubmission model + migration | ⬜ | `apps/api/internal/model/local_submission.go` |
| DB-07 | ExternalSubmission model + migration | ⬜ | `apps/api/internal/model/external_submission.go` |
| DB-08 | Snippet model + migration | ⬜ | `apps/api/internal/model/snippet.go` |
| DB-09 | UserSettings model + migration | ⬜ | `apps/api/internal/model/user_settings.go` |

### 1.3 Authentication

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| AUTH-01 | Email/password register (bcrypt) | ⬜ | `apps/api/internal/handler/auth.go` |
| AUTH-02 | Email/password login | ⬜ | `apps/api/internal/handler/auth.go` |
| AUTH-03 | Google OAuth 2.0 flow | ⬜ | `apps/api/internal/handler/auth_google.go` |
| AUTH-04 | JWT access token generation + middleware | ⬜ | `apps/api/internal/middleware/jwt.go` |
| AUTH-05 | Refresh token rotation | ⬜ | `apps/api/internal/service/auth.go` |
| AUTH-06 | Logout + token invalidation | ⬜ | `apps/api/internal/handler/auth.go` |

### 1.4 Account Linking

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| LINK-01 | Codeforces OIDC linking flow | ⬜ | `apps/api/internal/provider/codeforces/` |
| LINK-02 | TLX extension verification (HMAC) | ⬜ | `apps/api/internal/provider/tlx/` |
| LINK-03 | LinkedAccount CRUD (list, unlink) | ⬜ | `apps/api/internal/handler/account.go` |

### 1.5 Problem Sync

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| SYNC-01 | Sync endpoint — terima problem dari extension (HMAC) | ⬜ | `apps/api/internal/handler/sync.go` |
| SYNC-02 | Problem normalization + upsert logic | ⬜ | `apps/api/internal/service/sync.go` |
| SYNC-03 | TestCase sync dari extension | ⬜ | `apps/api/internal/handler/sync.go` |
| SYNC-04 | HMAC verification middleware | ⬜ | `apps/api/internal/middleware/hmac.go` |
| SYNC-05 | Nonce anti-replay (Redis) | ⬜ | `apps/api/internal/middleware/hmac.go` |

### 1.6 Problemset API

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| PROB-01 | List problems (filter: provider, tag, difficulty, status) | ⬜ | `apps/api/internal/handler/problem.go` |
| PROB-02 | Get problem detail by ID | ⬜ | `apps/api/internal/handler/problem.go` |
| PROB-03 | Full-text search problems | ⬜ | `apps/api/internal/handler/problem.go` |

### 1.7 Grader — Native Compiler Engine

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| GRD-01 | Language definitions + compiler flags (C++17, C++20, Python, Java, Node.js) | ⬜ | `apps/api/internal/grader/languages.go` |
| GRD-02 | Code sanitizer — strip dangerous patterns | ⬜ | `apps/api/internal/grader/sanitizer.go` |
| GRD-03 | Temp directory manager (create, write source, cleanup) | ⬜ | `apps/api/internal/grader/executor.go` |
| GRD-04 | Native exec via `os/exec` (compile + run) | ⬜ | `apps/api/internal/grader/executor.go` |
| GRD-05 | Firejail sandbox wrapper | ⬜ | `apps/api/internal/grader/sandbox.go` |
| GRD-06 | Output comparison (token-per-token, trim whitespace) | ⬜ | `apps/api/internal/grader/executor.go` |
| GRD-07 | Verdict aggregation (AC/WA/TLE/RE/CE) | ⬜ | `apps/api/internal/grader/executor.go` |
| GRD-08 | Redis FIFO queue (BRPOP) | ⬜ | `apps/api/internal/grader/queue.go` |
| GRD-09 | Concurrency limiter (max 5, semaphore) | ⬜ | `apps/api/internal/grader/queue.go` |
| GRD-10 | Grader API endpoint (`POST /api/grader/run`) | ⬜ | `apps/api/internal/handler/grader.go` |
| GRD-11 | Grader status endpoint (`GET /api/grader/status`) | ⬜ | `apps/api/internal/handler/grader.go` |
| GRD-12 | WebSocket — real-time grader result stream | ⬜ | `apps/api/internal/handler/grader_ws.go` |
| GRD-13 | Zombie process prevention (`Setpgid`, `Wait`, process group kill) | ⬜ | `apps/api/internal/grader/executor.go` |
| GRD-14 | Graceful shutdown — cancel all runs, cleanup temp dirs | ⬜ | `apps/api/internal/grader/executor.go` |

### 1.8 Submission History

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| SUB-01 | External submission fetch (CF API) | ⬜ | `apps/api/internal/provider/codeforces/` |
| SUB-02 | External submission fetch (TLX via extension) | ⬜ | `apps/api/internal/provider/tlx/` |
| SUB-03 | Local submission CRUD | ⬜ | `apps/api/internal/handler/submission.go` |
| SUB-04 | Submission list endpoint (filter: provider, verdict) | ⬜ | `apps/api/internal/handler/submission.go` |

### 1.9 Snippet Library API

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| SNIP-01 | Snippet CRUD | ⬜ | `apps/api/internal/handler/snippet.go` |
| SNIP-02 | Snippet search by tag | ⬜ | `apps/api/internal/handler/snippet.go` |
| SNIP-03 | Template placeholder engine (`{cursor}`, `{problem_name}`) | ⬜ | `apps/api/internal/service/snippet.go` |

### 1.10 Settings API

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| SET-01 | Get user settings | ⬜ | `apps/api/internal/handler/settings.go` |
| SET-02 | Update user settings (theme, language, template) | ⬜ | `apps/api/internal/handler/settings.go` |
| SET-03 | Default template per language CRUD | ⬜ | `apps/api/internal/handler/settings.go` |

### 1.11 Status & Health

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| STS-01 | Health check endpoint (`GET /api/health`) | ⬜ | `apps/api/internal/handler/health.go` |
| STS-02 | Component status — database ping | ⬜ | `apps/api/internal/handler/health.go` |
| STS-03 | Component status — Redis ping | ⬜ | `apps/api/internal/handler/health.go` |
| STS-04 | Component status — Grader (compiler versions, queue depth, firejail) | ⬜ | `apps/api/internal/handler/health.go` |
| STS-05 | Component status — Provider connections (CF, TLX) | ⬜ | `apps/api/internal/handler/health.go` |
| STS-06 | Component status — Extension | ⬜ | `apps/api/internal/handler/health.go` |

### 1.12 Dashboard Analytics API

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| DASH-01 | Overview stats (total solved, streak, accuracy) | ⬜ | `apps/api/internal/handler/dashboard.go` |
| DASH-02 | Rating history endpoint | ⬜ | `apps/api/internal/handler/dashboard.go` |
| DASH-03 | Activity heatmap data | ⬜ | `apps/api/internal/handler/dashboard.go` |
| DASH-04 | Tag weakness analysis | ⬜ | `apps/api/internal/handler/dashboard.go` |
| DASH-05 | Dashboard cache layer (Redis) | ⬜ | `apps/api/internal/service/dashboard.go` |

### 1.13 Repository Layer

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| REPO-01 | User repository | ⬜ | `apps/api/internal/repository/user.go` |
| REPO-02 | Problem repository | ⬜ | `apps/api/internal/repository/problem.go` |
| REPO-03 | Submission repository | ⬜ | `apps/api/internal/repository/submission.go` |
| REPO-04 | Snippet repository | ⬜ | `apps/api/internal/repository/snippet.go` |
| REPO-05 | Settings repository | ⬜ | `apps/api/internal/repository/settings.go` |

---

## 2. Frontend — Next.js Web App (`apps/web/`)

### 2.1 Foundation

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| WEB-01 | Init Next.js 14 project (Bun) | ⬜ | `apps/web/package.json` |
| WEB-02 | TailwindCSS config — dark/light palette, fonts | ⬜ | `apps/web/tailwind.config.ts` |
| WEB-03 | TypeScript strict config | ⬜ | `apps/web/tsconfig.json` |
| WEB-04 | `globals.css` — scrollbar, animations | ⬜ | `apps/web/src/app/globals.css` |
| WEB-05 | Root layout — ThemeProvider (next-themes, `attribute="class"`, `defaultTheme="dark"`) | ⬜ | `apps/web/src/app/layout.tsx` |
| WEB-06 | Zustand store setup (auth, settings, grader, problems) | ⬜ | `apps/web/src/stores/` |

### 2.2 Auth Pages — (auth) Route Group (no shell)

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| FE-AUTH-01 | Login page — email/password form + Google OAuth button | ⬜ | `apps/web/src/app/(auth)/login/page.tsx` |
| FE-AUTH-02 | Register page — email/password/confirm form + Google OAuth | ⬜ | `apps/web/src/app/(auth)/register/page.tsx` |
| FE-AUTH-03 | Auth form components (Input, Button, Divider) | ⬜ | `apps/web/src/components/auth/` |
| FE-AUTH-04 | Auth API client (login, register, refresh, logout) | ⬜ | `apps/web/src/lib/api/auth.ts` |

### 2.3 Onboarding Page

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| FE-ONB-01 | Onboarding centered card — 3 step guide | ⬜ | `apps/web/src/app/(auth)/onboarding/page.tsx` |
| FE-ONB-02 | "Mulai Dashboard" CTA button | ⬜ | `apps/web/src/app/(auth)/onboarding/page.tsx` |

### 2.4 App Shell — Sidebar + Topbar

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| FE-SHELL-01 | App layout — sidebar + topbar + content area | ⬜ | `apps/web/src/app/(app)/layout.tsx` |
| FE-SHELL-02 | Sidebar component (220px, nav items, submenu, profile, logout) | ⬜ | `apps/web/src/components/shell/sidebar.tsx` |
| FE-SHELL-03 | Topbar component (44px, title, actions, badges) | ⬜ | `apps/web/src/components/shell/topbar.tsx` |
| FE-SHELL-04 | Sidebar dynamic submenu — provider-based (CF, TLX) | ⬜ | `apps/web/src/components/shell/sidebar.tsx` |
| FE-SHELL-05 | Mobile responsive — collapsible sidebar, hamburger | ⬜ | `apps/web/src/components/shell/sidebar.tsx` |
| FE-SHELL-06 | Breadcrumb component | ⬜ | `apps/web/src/components/ui/breadcrumb.tsx` |

### 2.5 UI Components (Shared)

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

### 2.6 Dashboard Page

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| FE-DASH-01 | Overview stat cards (Solved, Streak, Accuracy) | ⬜ | `apps/web/src/app/(app)/dashboard/page.tsx` |
| FE-DASH-02 | Rating chart (line chart) | ⬜ | `apps/web/src/components/dashboard/rating-chart.tsx` |
| FE-DASH-03 | Activity heatmap (calendar grid) | ⬜ | `apps/web/src/components/dashboard/heatmap.tsx` |
| FE-DASH-04 | Tag weakness table | ⬜ | `apps/web/src/components/dashboard/tag-weakness.tsx` |
| FE-DASH-05 | Dashboard API client | ⬜ | `apps/web/src/lib/api/dashboard.ts` |

### 2.7 Problemset Page

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| FE-PROB-01 | Problemset list page — filter bar + table | ⬜ | `apps/web/src/app/(app)/problems/page.tsx` |
| FE-PROB-02 | Filter pills (provider, tag, difficulty, status) | ⬜ | `apps/web/src/components/problemset/filter-bar.tsx` |
| FE-PROB-03 | Search input (full-text) | ⬜ | `apps/web/src/components/problemset/search-input.tsx` |
| FE-PROB-04 | Problems table component | ⬜ | `apps/web/src/components/problemset/problem-table.tsx` |
| FE-PROB-05 | Problemset API client | ⬜ | `apps/web/src/lib/api/problems.ts` |

### 2.8 Problem Detail Page — Split Pane Editor

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

### 2.9 Grader Panel (inside Problem Detail)

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

### 2.10 Submissions Page

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| FE-SUB-01 | Submission list page — table + filter | ⬜ | `apps/web/src/app/(app)/submissions/page.tsx` |
| FE-SUB-02 | Submission table (problem, verdict, lang, OJ, runtime, memory) | ⬜ | `apps/web/src/components/submissions/submission-table.tsx` |
| FE-SUB-03 | Provider filter dropdown | ⬜ | `apps/web/src/components/submissions/provider-filter.tsx` |
| FE-SUB-04 | Submissions API client | ⬜ | `apps/web/src/lib/api/submissions.ts` |

### 2.11 Connections Page

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| FE-CONN-01 | Connections page — provider card list | ⬜ | `apps/web/src/app/(app)/connections/page.tsx` |
| FE-CONN-02 | Provider card — CF (status, username, rating, link/unlink) | ⬜ | `apps/web/src/components/connections/provider-card.tsx` |
| FE-CONN-03 | Provider card — TLX (status, link via extension) | ⬜ | `apps/web/src/components/connections/provider-card.tsx` |
| FE-CONN-04 | Provider card — Google (status, email, unlink) | ⬜ | `apps/web/src/components/connections/provider-card.tsx` |
| FE-CONN-05 | Connections API client | ⬜ | `apps/web/src/lib/api/connections.ts` |

### 2.12 Settings Page

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| FE-SET-01 | Settings page layout — sections | ⬜ | `apps/web/src/app/(app)/settings/page.tsx` |
| FE-SET-02 | Language dropdown selector | ⬜ | `apps/web/src/components/settings/language-select.tsx` |
| FE-SET-03 | Template editor — small Monaco per language | ⬜ | `apps/web/src/components/settings/template-editor.tsx` |
| FE-SET-04 | Preference toggles (auto-sync, theme) | ⬜ | `apps/web/src/components/settings/preference-toggles.tsx` |
| FE-SET-05 | Save button + API call | ⬜ | `apps/web/src/components/settings/save-button.tsx` |
| FE-SET-06 | Settings API client | ⬜ | `apps/web/src/lib/api/settings.ts` |

### 2.13 Status Page

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| FE-STAT-01 | Status page — overall indicator + component cards | ⬜ | `apps/web/src/app/(app)/status/page.tsx` |
| FE-STAT-02 | Health card component (name, status dot, latency, detail) | ⬜ | `apps/web/src/components/status/health-card.tsx` |
| FE-STAT-03 | Refresh button + auto-poll (30s) | ⬜ | `apps/web/src/components/status/refresh-button.tsx` |
| FE-STAT-04 | Status API client | ⬜ | `apps/web/src/lib/api/status.ts` |

### 2.14 Extension Page

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| FE-EXT-01 | Extension install guide card | ⬜ | `apps/web/src/app/(app)/extension/page.tsx` |
| FE-EXT-02 | Extension status display (version, connected) | ⬜ | `apps/web/src/components/extension/extension-status.tsx` |
| FE-EXT-03 | Extension API client | ⬜ | `apps/web/src/lib/api/extension.ts` |

---

## 3. Browser Extension (`apps/extension/`)

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| EXT-01 | Init extension project (Bun + Vite + TypeScript) | ⬜ | `apps/extension/package.json` |
| EXT-02 | Manifest V3 | ⬜ | `apps/extension/manifest.json` |
| EXT-03 | Codeforces content scraper | ⬜ | `apps/extension/src/content/codeforces.ts` |
| EXT-04 | TLX content scraper | ⬜ | `apps/extension/src/content/tlx.ts` |
| EXT-05 | DOM parser per platform | ⬜ | `apps/extension/src/content/` |
| EXT-06 | Background script — HMAC-SHA256 signing | ⬜ | `apps/extension/src/background/` |
| EXT-07 | Nonce anti-replay | ⬜ | `apps/extension/src/background/` |
| EXT-08 | Problem sync — POST ke local API | ⬜ | `apps/extension/src/background/` |
| EXT-09 | TLX session detection — verify user | ⬜ | `apps/extension/src/content/tlx.ts` |
| EXT-10 | Popup UI — status, sync button, settings | ⬜ | `apps/extension/src/popup/` |
| EXT-11 | Auto-detect halaman soal CF/TLX | ⬜ | `apps/extension/src/content/` |
| EXT-12 | Versioned scraper — selector fallback | ⬜ | `apps/extension/src/content/` |

---

## 4. Testing & Quality Assurance

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| TEST-01 | Go unit tests — auth service | ⬜ | `apps/api/internal/service/auth_test.go` |
| TEST-02 | Go unit tests — grader executor | ⬜ | `apps/api/internal/grader/executor_test.go` |
| TEST-03 | Go unit tests — sanitizer (dangerous code patterns) | ⬜ | `apps/api/internal/grader/sanitizer_test.go` |
| TEST-04 | Go unit tests — firejail sandbox (block network, block file write) | ⬜ | `apps/api/internal/grader/sandbox_test.go` |
| TEST-05 | Go integration tests — API endpoints | ⬜ | `apps/api/internal/handler/` |
| TEST-06 | Grader stress test — 10 concurrent C++ compile + exec | ⬜ | `apps/api/internal/grader/` |
| TEST-07 | Frontend unit tests (Vitest) | ⬜ | `apps/web/src/` |
| TEST-08 | E2E tests — Playwright (auth, sync, grader, dashboard) | ⬜ | `e2e/` |
| TEST-09 | Security test — kirim kode berbahaya (`fork()`, `system("rm -rf /")`) | ⬜ | `apps/api/internal/grader/` |

---

## 5. Documentation

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| DOC-01 | Developer guide — setup, architecture, contribution | ⬜ | `docs/developer-guide.md` |
| DOC-02 | User guide — fitur, workflow, troubleshooting | ⬜ | `docs/user-guide.md` |
| DOC-03 | API docs — endpoint list, request/response schema | ⬜ | `docs/api.md` |
| DOC-04 | Firejail setup guide | ⬜ | `docs/firejail-setup.md` |

---

## 6. Deployment & DevOps

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| OPS-01 | Systemd service — Go API | ⬜ | `deploy/cphub-api.service` |
| OPS-02 | Systemd service — Next.js (Bun) | ⬜ | `deploy/cphub-web.service` |
| OPS-03 | Cron — orphan temp dir cleanup | ⬜ | `deploy/cron-cleanup.sh` |
| OPS-04 | Cron — VACUUM ANALYZE | ⬜ | `deploy/cron-vacuum.sh` |
| OPS-05 | Logrotate config | ⬜ | `deploy/logrotate.conf` |

---

## Dependency Graph (Simplified)

```
Phase 1 (Foundation)
INF-01..07 → API-01..07 → DB-01..09 → AUTH-01..06 → LINK-01..03
                                          ↓
WEB-01..06 → FE-AUTH-01..04 → FE-SHELL-01..06 → FE-UI-01..09
                                          ↓
EXT-01..02 → EXT-03..12

Phase 2 (Core)
REPO-01..05 → SYNC-01..05 → PROB-01..03
              GRD-01..14 → SUB-01..04
              FE-EDIT-01..08 → FE-GRD-01..09
              FE-PROB-01..05

Phase 3 (Enhancement)
DASH-01..05 → FE-DASH-01..05
SNIP-01..03 → SET-01..03 → FE-SET-01..06
STS-01..06 → FE-STAT-01..04 → FE-EXT-01..03
FE-CONN-01..05 → FE-ONB-01..02
FE-SUB-01..04

Phase 4 (Polish)
TEST-01..09 → DOC-01..04 → OPS-01..05
```

---

## Commit Convention

Format: `type(scope): description`

| Type | Usage |
|------|-------|
| `feat` | New feature |
| `fix` | Bug fix |
| `refactor` | Code restructuring |
| `test` | Add/update tests |
| `docs` | Documentation |
| `chore` | Maintenance, config, deps |
| `style` | Formatting, UI-only |

**Scopes:** `api`, `web`, `ext`, `infra`, `grader`, `auth`, `db`, `sync`, `dashboard`, `problemset`, `submission`, `settings`, `status`, `connections`, `onboarding`, `docs`, `test`, `ops`

**Examples:**
- `feat(api): implement grader native C++ execution engine`
- `feat(web): add split-pane problem detail layout`
- `fix(grader): prevent zombie processes via process group kill`
- `test(api): add firejail sandbox security tests`
- `chore(infra): add docker-compose with PostgreSQL and Redis`
