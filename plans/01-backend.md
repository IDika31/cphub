# 01 — Backend: Go API (`apps/api/`)

> **Status:** ⬜ (0/55)

---

## 1.1 Foundation

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| API-01 | Init Go module | ✅ | `apps/api/go.mod` |
| API-02 | Config loader (.env, struct) | ✅ | `apps/api/internal/config/` |
| API-03 | Database connection + health check (GORM + PostgreSQL) | ✅ | `apps/api/internal/database/` |
| API-04 | Redis connection + health check | ✅ | `apps/api/internal/database/redis.go` |
| API-05 | Migration runner (golang-migrate) | ✅ | `apps/api/cmd/migrate.go` |
| API-06 | Fiber server setup + graceful shutdown | ✅ | `apps/api/internal/server/` |
| API-07 | `main.go` entrypoint | ✅ | `apps/api/cmd/main.go` |

## 1.2 Database — Models & Migrations

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

## 1.3 Authentication

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| AUTH-01 | Email/password register (bcrypt) | ⬜ | `apps/api/internal/handler/auth.go` |
| AUTH-02 | Email/password login | ⬜ | `apps/api/internal/handler/auth.go` |
| AUTH-03 | Google OAuth 2.0 flow | ⬜ | `apps/api/internal/handler/auth_google.go` |
| AUTH-04 | JWT access token generation + middleware | ⬜ | `apps/api/internal/middleware/jwt.go` |
| AUTH-05 | Refresh token rotation | ⬜ | `apps/api/internal/service/auth.go` |
| AUTH-06 | Logout + token invalidation | ⬜ | `apps/api/internal/handler/auth.go` |

## 1.4 Account Linking

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| LINK-01 | Codeforces OIDC linking flow | ⬜ | `apps/api/internal/provider/codeforces/` |
| LINK-02 | TLX extension verification (HMAC) | ⬜ | `apps/api/internal/provider/tlx/` |
| LINK-03 | LinkedAccount CRUD (list, unlink) | ⬜ | `apps/api/internal/handler/account.go` |

## 1.5 Problem Sync

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| SYNC-01 | Sync endpoint — terima problem dari extension (HMAC) | ⬜ | `apps/api/internal/handler/sync.go` |
| SYNC-02 | Problem normalization + upsert logic | ⬜ | `apps/api/internal/service/sync.go` |
| SYNC-03 | TestCase sync dari extension | ⬜ | `apps/api/internal/handler/sync.go` |
| SYNC-04 | HMAC verification middleware | ⬜ | `apps/api/internal/middleware/hmac.go` |
| SYNC-05 | Nonce anti-replay (Redis) | ⬜ | `apps/api/internal/middleware/hmac.go` |

## 1.6 Problemset API

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| PROB-01 | List problems (filter: provider, tag, difficulty, status) | ⬜ | `apps/api/internal/handler/problem.go` |
| PROB-02 | Get problem detail by ID | ⬜ | `apps/api/internal/handler/problem.go` |
| PROB-03 | Full-text search problems | ⬜ | `apps/api/internal/handler/problem.go` |

## 1.7 Grader — Native Compiler Engine

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| GRD-01 | Language definitions + compiler flags (C++17, C++20, Python, Java, JS) | ⬜ | `apps/api/internal/grader/languages.go` |
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

## 1.8 Submission History

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| SUB-01 | External submission fetch (CF API) | ⬜ | `apps/api/internal/provider/codeforces/` |
| SUB-02 | External submission fetch (TLX via extension) | ⬜ | `apps/api/internal/provider/tlx/` |
| SUB-03 | Local submission CRUD | ⬜ | `apps/api/internal/handler/submission.go` |
| SUB-04 | Submission list endpoint (filter: provider, verdict) | ⬜ | `apps/api/internal/handler/submission.go` |

## 1.9 Snippet Library API

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| SNIP-01 | Snippet CRUD | ⬜ | `apps/api/internal/handler/snippet.go` |
| SNIP-02 | Snippet search by tag | ⬜ | `apps/api/internal/handler/snippet.go` |
| SNIP-03 | Template placeholder engine (`{cursor}`, `{problem_name}`) | ⬜ | `apps/api/internal/service/snippet.go` |

## 1.10 Settings API

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| SET-01 | Get user settings | ⬜ | `apps/api/internal/handler/settings.go` |
| SET-02 | Update user settings (theme, language, template) | ⬜ | `apps/api/internal/handler/settings.go` |
| SET-03 | Default template per language CRUD | ⬜ | `apps/api/internal/handler/settings.go` |

## 1.11 Status & Health

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| STS-01 | Health check endpoint (`GET /api/health`) | ⬜ | `apps/api/internal/handler/health.go` |
| STS-02 | Component status — database ping | ⬜ | `apps/api/internal/handler/health.go` |
| STS-03 | Component status — Redis ping | ⬜ | `apps/api/internal/handler/health.go` |
| STS-04 | Component status — Grader (compiler versions, queue depth, firejail) | ⬜ | `apps/api/internal/handler/health.go` |
| STS-05 | Component status — Provider connections (CF, TLX) | ⬜ | `apps/api/internal/handler/health.go` |
| STS-06 | Component status — Extension | ⬜ | `apps/api/internal/handler/health.go` |

## 1.12 Dashboard Analytics API

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| DASH-01 | Overview stats (total solved, streak, accuracy) | ⬜ | `apps/api/internal/handler/dashboard.go` |
| DASH-02 | Rating history endpoint | ⬜ | `apps/api/internal/handler/dashboard.go` |
| DASH-03 | Activity heatmap data | ⬜ | `apps/api/internal/handler/dashboard.go` |
| DASH-04 | Tag weakness analysis | ⬜ | `apps/api/internal/handler/dashboard.go` |
| DASH-05 | Dashboard cache layer (Redis) | ⬜ | `apps/api/internal/service/dashboard.go` |

## 1.13 Repository Layer

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| REPO-01 | User repository | ⬜ | `apps/api/internal/repository/user.go` |
| REPO-02 | Problem repository | ⬜ | `apps/api/internal/repository/problem.go` |
| REPO-03 | Submission repository | ⬜ | `apps/api/internal/repository/submission.go` |
| REPO-04 | Snippet repository | ⬜ | `apps/api/internal/repository/snippet.go` |
| REPO-05 | Settings repository | ⬜ | `apps/api/internal/repository/settings.go` |
