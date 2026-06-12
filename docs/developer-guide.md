# CPHub V4 — Developer Guide

## Architecture

```
Browser → Next.js (port 3000) → Go API (port 3001) → PostgreSQL + Redis (native)
                                      ↑
Browser Extension ──── HMAC POST ──────┘
```

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 14 (App Router), TypeScript, Bun, TailwindCSS, Zustand |
| Backend | Go 1.22+, Fiber v2, GORM, golang-migrate |
| Database | PostgreSQL (native) |
| Cache/Queue | Redis (native) |
| Grader | GCC 14+, Python 3.12+, Node.js 22+, Java 21+ (native) |
| Sandbox | firejail |
| Extension | Chrome Manifest V3, Vite, TypeScript, React |

## Quick Start

```bash
# Prerequisites
sudo pacman -S gcc python nodejs jdk21-openjdk firejail postgresql redis

# Setup DB
sudo -u postgres createuser cphub
sudo -u postgres psql -c "ALTER USER cphub PASSWORD 'cphub'; ALTER USER cphub CREATEDB;"
sudo -u postgres createdb cphub -O cphub

# Setup env
cp .env.example .env

# Setup firejail
sudo bash deploy/setup-firejail.sh

# Migrate
bun run db:migrate

# Run
bun run dev:api     # Terminal 1 — API
bun run dev:web     # Terminal 2 — Frontend
```

## API Endpoints

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/health` | None |
| POST | `/api/auth/register` | None |
| POST | `/api/auth/login` | None |
| GET | `/api/auth/google` | None |
| POST | `/api/sync/problem` | HMAC |
| POST | `/api/sync/submission` | HMAC |
| GET | `/api/problems` | Optional |
| GET | `/api/problems/:id` | Optional |
| POST | `/api/grader/run` | JWT |
| GET | `/api/grader/status` | JWT |
| GET | `/api/submissions/local` | JWT |
| GET | `/api/submissions/external` | JWT |
| GET | `/api/dashboard/overview` | JWT |
| GET | `/api/dashboard/rating` | JWT |
| GET | `/api/dashboard/heatmap` | JWT |
| GET | `/api/dashboard/tag-weakness` | JWT |

## Commit Convention

`type(scope): description`

Types: feat, fix, refactor, test, docs, chore, style
Scopes: api, web, ext, infra, grader, auth, db, sync, dashboard, problemset, submission, settings, status, connections, onboarding, docs, test, ops
