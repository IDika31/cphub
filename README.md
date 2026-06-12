# CPHub V4 — Competitive Programming Hub

Platform *local-first* untuk latihan competitive programming. Integrasi workflow **Codeforces** + **TLX TOKI** dalam dashboard analitik, editor Monaco, dan grader native Arch Linux CachyOS.

## Tech Stack

| Layer | Teknologi |
|-------|-----------|
| Backend API (port 3001) | Go 1.22+, Fiber v2, GORM, golang-migrate |
| Frontend (port 3000) | Next.js 14 (App Router), TypeScript, Bun, TailwindCSS |
| Database | PostgreSQL 16 (Docker) |
| Cache/Queue | Redis 7 (Docker) |
| Grader | Native GCC 14+, Python 3.12+, Node.js 22+, Java 21+ |
| Sandbox | firejail |
| Extension | Chrome Manifest V3, Vite + TypeScript |

## Prerequisites

- **Arch Linux** (CachyOS preferred)
- Go 1.22+, Bun, Docker, Docker Compose
- GCC 14+, Python 3.12+, Node.js 22+, JDK 21+
- firejail

## Quick Start

```bash
# 1. Install system dependencies
sudo pacman -S gcc python nodejs jdk21-openjdk firejail

# 2. Copy environment config
cp .env.example .env
# Edit .env — set JWT_SECRET, EXTENSION_HMAC_SECRET, OAuth credentials

# 3. Start infrastructure
bun run infra:up

# 4. Run database migrations
bun run db:migrate

# 5. Start API (terminal 1)
bun run dev:api

# 6. Start frontend (terminal 2)
bun run dev:web

# 7. Start extension dev (terminal 3, optional)
bun run dev:ext
```

Open `http://localhost:3000` in browser.

## Project Structure

```
competitive-hub-v4/
├── apps/
│   ├── api/           # Go backend (Fiber v2)
│   ├── web/           # Next.js frontend
│   └── extension/     # Browser extension
├── plans/             # Implementation plans per track
├── docker-compose.yml # PostgreSQL + Redis
└── package.json       # Root workspace (Bun)
```

## License

Internal — Andika Pratama · Universitas Sam Ratulangi
