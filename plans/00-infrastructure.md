# 00 — Monorepo Setup & Infrastructure

> **Status:** 5/7 (INF-06, INF-07 require sudo)

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| INF-01 | Init `package.json` root workspace (Bun) | ✅ | `package.json` |
| INF-02 | Docker Compose — PostgreSQL 16 + Redis 7 (no Piston) | ✅ | `docker-compose.yml` |
| INF-03 | `.env.example` template | ✅ | `.env.example` |
| INF-04 | `.gitignore` (Go, Next.js, Docker, IDE) | ✅ | `.gitignore` |
| INF-05 | `README.md` — setup guide | ✅ | `README.md` |
| INF-06 | Firejail profile kustom | ⬜ | `/etc/firejail/cphub.local` |
| INF-07 | System limits config (`cphub.conf`) | ⬜ | `/etc/security/limits.d/cphub.conf` |
