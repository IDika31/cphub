# CPHub V4 — Master Plan Index

> **Sumber:** PRD.md v4.0.0 (2026-06-12)
> **Stack:** Go (Fiber v2) + Next.js 14 (Bun) + PostgreSQL 16 + Redis 7 + Browser Extension (Vite)
> **Commit Convention:** `type(scope): description`

---

## File Plans

| File | Track | Task Count |
|------|-------|------------|
| [00-infrastructure.md](00-infrastructure.md) | Monorepo, Docker, Config | 7 |
| [01-backend.md](01-backend.md) | Go API — semua sub-section | ~55 |
| [02-frontend.md](02-frontend.md) | Next.js Web App — semua halaman + komponen | ~60 |
| [03-extension.md](03-extension.md) | Browser Extension — 8 sub-section | 43 |
| [04-testing.md](04-testing.md) | Unit, Integration, E2E, Security | 9 |
| [05-documentation.md](05-documentation.md) | Developer, User, API, Firejail docs | 4 |
| [06-devops.md](06-devops.md) | Systemd, Cron, Logrotate | 5 |

**Total: ~183 tasks**

---

## Status Legend

| Simbol | Arti |
|--------|------|
| ⬜ | Not started |
| 🔵 | In progress |
| ✅ | Done |
| ⏳ | Blocked |
| ❌ | Skipped |

---

## Phase Dependency

```
Phase 1 — Foundation
  infra → api-foundation → db-models → auth → account-linking
  infra → web-foundation → auth-pages → app-shell → ui-components
  infra → ext-foundation → scrapers

Phase 2 — Core
  db-models → repositories → sync → problemset-api
  repositories → grader-engine → grader-api
  app-shell → problem-detail → grader-panel
  problemset-api → problemset-page

Phase 3 — Enhancement
  repositories → dashboard-api → dashboard-page
  repositories → snippet-api → settings-api → settings-page
  repositories → status-api → status-page + extension-page
  repositories → submissions-api → submissions-page
  account-linking → connections-page
  auth → onboarding-page

Phase 4 — Polish
  all → testing → docs → devops
```

---

## Commit Convention

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
