# CPHub V4 — Developer Guide

## Architecture

```
Browser → Next.js (port 3000) → Go API (port 3001) → PostgreSQL 16 + Redis 7
                                      ↑
Browser Extension ──── HMAC POST ──────┘
```

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 14 (App Router), TypeScript, Bun, TailwindCSS, Zustand |
| Backend | Go 1.22+, Fiber v2, GORM, golang-migrate |
| Database | PostgreSQL 16 (Docker) |
| Cache/Queue | Redis 7 (Docker) |
| Grader | GCC 14+, Python 3.12+, Node.js 22+, Java 21+ (native) |
| Sandbox | firejail |
| Extension | Chrome Manifest V3, Vite, TypeScript, React |

## Project Structure

```
competitive-hub-v4/
├── apps/
│   ├── api/          # Go backend
│   ├── web/          # Next.js frontend
│   └── extension/    # Browser extension
├── plans/            # Implementation plans
├── docs/             # Documentation
├── deploy/           # Systemd services, cron
├── docker-compose.yml
└── package.json      # Root workspace (Bun)
```

## Quick Start

```bash
# Prerequisites
sudo pacman -S gcc python nodejs jdk21-openjdk firejail

# Start infra
bun run infra:up

# Setup env
cp .env.example .env

# API
cd apps/api && go run ./cmd/main.go

# Frontend
cd apps/web && bun dev

# Extension
cd apps/extension && bun dev
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
