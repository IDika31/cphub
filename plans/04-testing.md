# 04 — Testing & Quality Assurance

> **Status:** ⬜ (0/9)

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
