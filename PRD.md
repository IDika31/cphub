# CPHub V4 — Product Requirements Document

**Versi:** 4.0.0
**Status:** Draft
**Author:** Andika Pratama
**Terakhir Diperbarui:** 2026-06-12
**Klasifikasi:** Internal — Engineering

---

## Daftar Isi

1. [Product Overview](#1-product-overview)
2. [Goals & Success Metrics](#2-goals--success-metrics)
3. [Target Users & Use Cases](#3-target-users--use-cases)
4. [Functional Requirements](#4-functional-requirements)
5. [System Architecture & Tech Stack](#5-system-architecture--tech-stack)
6. [Database Schema](#6-database-schema)
7. [Browser Extension](#7-browser-extension)
8. [Code Editor & Template System](#8-code-editor--template-system)
9. [Local Grader — Native Compiler](#9-local-grader--native-compiler)
10. [Analytics Dashboard](#10-analytics-dashboard)
11. [Authentication & Account Linking](#11-authentication--account-linking)
12. [API Specification](#12-api-specification)
13. [Security Requirements](#13-security-requirements)
14. [Performance & Optimization](#14-performance--optimization)
15. [UI/UX Requirements](#15-uiux-requirements)
16. [Testing & Quality Assurance](#16-testing--quality-assurance)
17. [Development Workflow & Deployment](#17-development-workflow--deployment)
18. [Roadmap & Milestones](#18-roadmap--milestones)
19. [Risk & Mitigation](#19-risk--mitigation)
20. [Glossary](#20-glossary)
21. [Error Codes & Error Catalog](#21-error-codes--error-catalog)
22. [WebSocket Contract](#22-websocket-contract)
23. [Response Schema per Endpoint](#23-response-schema-per-endpoint)
24. [Extension Versioning & Update Strategy](#24-extension-versioning--update-strategy)
25. [Data Retention Policy](#25-data-retention-policy)
26. [Onboarding Flow](#26-onboarding-flow)
27. [Acceptance Criteria Lengkap — Status & Extension Page](#27-acceptance-criteria-lengkap--status--extension-page)
28. [Definition of "Degraded" — Status Komponen](#28-definition-of-degraded--status-komponen)
29. [Struktur Folder Monorepo](#29-struktur-folder-monorepo)
30. [Provider-Extensible Architecture](#30-provider-extensible-architecture)

---

## 1. Product Overview

### 1.1 Nama Produk

**CPHub V4** — *Competitive Programming Hub*

### 1.2 Visi

Platform terintegrasi dan *local-first* untuk latihan competitive programming yang menyatukan workflow Codeforces dan TLX TOKI dalam satu dashboard analitik, editor kode, dan grader lokal — dengan antarmuka yang bersih, cepat, dan nyaman digunakan dalam sesi panjang. Grader menggunakan kompiler native sistem (Arch Linux CachyOS), tanpa dependensi Docker.

### 1.3 Scope v4.0

| Area | Deskripsi |
|------|-----------|
| Autentikasi | Wajib login — Email/Password atau Google OAuth |
| Account Linking | Codeforces (OAuth 2.0/OIDC) & TLX TOKI (verifikasi via browser extension) |
| Sidebar Navigasi | Dinamis per provider yang terhubung: Dashboard, Problemset, Submission, Settings, Status, Extension |
| Dashboard | Analitik terunifikasi: progress, rating, tag weakness, streak, heatmap |
| Problem Sync | Scraping otomatis via browser extension + penyimpanan lokal |
| Editor | Split-view Monaco Editor dengan template per bahasa & auto-save |
| Grader | Eksekusi kode via kompiler native Arch Linux CachyOS — kompilasi langsung dengan GCC/G++/Python3/Node.js, tanpa Docker |
| Grader Queue | FIFO via Redis, maks 5 concurrent, timeout 5 detik per eksekusi |
| Grader Sandbox | **firejail** — seccomp, no-network, private-tmp, noroot |
| Tema | Dark mode (#0f0f10, #18181b, #1f1f23, #8b5cf6 accent) dan Light mode (#f4f4f5, #ffffff, #71717a) |
| Backend | Go (Golang) — local deployment |
| Deployment | Local-only, tanpa dependensi cloud |

### 1.4 Out of Scope (v4.0)

- Fitur kolaborasi multi-user atau online contest real-time
- Submission langsung ke Codeforces/TLX dari CPHub
- Mobile native app (iOS/Android)
- Hosting cloud / multi-tenant deployment
- Akses ke API publik TLX (tidak tersedia — digantikan oleh extension)
- Grader via Docker / Piston API

---

## 2. Goals & Success Metrics

### 2.1 Business Goals

- Menyederhanakan workflow competitive programmer yang berpindah antara CF, TLX, dan editor lokal
- Meningkatkan efisiensi latihan lewat analitik berbasis data (tag weakness, streak, rating tracker)
- Memberikan eksekusi kode cepat dan aman tanpa bergantung pada judge eksternal atau container Docker
- Menghadirkan pengalaman visual yang konsisten mengikuti mockup ketat dengan dua tema yang berbeda karakter

### 2.2 Key Success Metrics (KPIs)

| Metrik | Target (End of Phase 4) |
|--------|-------------------------|
| Waktu sync problem (extension → DB) | < 2 detik |
| Waktu eksekusi grader (C++, 1 test case) | < 200ms (native compile) |
| Auto-save latency | ≤ 300ms debounce |
| Uptime lokal | ≥ 99% selama sesi aktif |
| Code coverage unit test | ≥ 85% baris |
| Coverage critical paths | 100% (auth, sync, grader, analytics) |
| Dashboard load time (cold) | < 1.5 detik |
| Waktu pertama provider muncul di sidebar setelah berhasil terhubung | < 3 detik |

---

## 3. Target Users & Use Cases

### 3.1 Target Users

**Competitive Programmer (Pemula–Expert)** yang menginginkan:
- Workflow terpusat antar multiple platform
- Analitik mendalam untuk identifikasi kelemahan
- Eksekusi kode cepat tanpa upload ke judge eksternal dan tanpa overhead container
- Tampilan yang nyaman untuk sesi latihan panjang — dark theme elegan seperti mockup

### 3.2 Primary Use Cases

| ID | Use Case | Deskripsi |
|----|----------|-----------|
| UC-01 | Registrasi / Login | Pilih email+password atau Google OAuth → redirect ke Dashboard |
| UC-02 | Hubungkan akun Codeforces | Link via OIDC → provider muncul di sidebar (Problemset & Submission) |
| UC-03 | Hubungkan akun TLX | Buka profil TLX di browser, extension deteksi sesi aktif → verifikasi → provider muncul di sidebar |
| UC-04 | Sync problem dari browser | Buka halaman soal CF atau TLX → extension auto-detect → scrape → kirim ke API lokal → tersimpan |
| UC-05 | Coding di editor CPHub | Pilih problem → split-view editor → pilih template → kode → run grader lokal → lihat diff |
| UC-06 | Kelola test case | Tambah custom test case → import/export JSON → simpan ke snippet library |
| UC-07 | Pantau analitik | Lihat rating chart, heatmap, tag weakness → filter problemset → identifikasi area latihan |
| UC-08 | Lihat riwayat submission | Pilih provider di sidebar Submission → lihat list submission dengan verdict dan waktu |
| UC-09 | Atur template default | Buka Settings → pilih bahasa dari dropdown → edit template kode default di editor kecil → simpan |
| UC-10 | Pantau status sistem | Buka Status → lihat kondisi grader, koneksi provider, dan extension |

---

## 4. Functional Requirements

### 4.1 Ringkasan Fitur

| ID | Fitur | Requirement |
|----|-------|-------------|
| FR-01 | Authentication | Email/password (bcrypt), Google OAuth 2.0, session JWT, refresh token |
| FR-02 | Account Linking | CF via OIDC; TLX via extension session-detection + HMAC verification |
| FR-03 | Problem Sync | Extension scrapes statement, I/O, constraints, tags → POST ke local API → normalized storage |
| FR-04 | Dashboard | Unified progress table, rating chart, heatmap kalender, tag weakness analysis, streak counter |
| FR-05 | Editor | Monaco Editor split-view, template per bahasa, auto-save 300ms, multi-language syntax |
| FR-06 | Grader | **Native compiler Arch Linux CachyOS** — GCC 14+ untuk C++17/20, Python 3.12+, Node.js 22+, Java 21+; eksekusi via firejail sandbox; verdict aggregation, diff viewer |
| FR-07 | Test Case Manager | Sample dari sync, custom add/edit, bulk import, export JSON, isolasi per problem |
| FR-08 | Snippet Library | Template reusable, pencarian berbasis tag, variabel placeholder, versioning |
| FR-09 | Problemset | Filter per provider, tag, difficulty, status, full-text search; submenu sidebar dinamis |
| FR-10 | Submission History | Riwayat submission per provider (CF dari API, TLX dari scraping extension), submenu sidebar dinamis |
| FR-11 | Sidebar Navigasi | Navigasi utama dinamis dengan submenu provider yang hanya tampil bila provider sudah terhubung |
| FR-12 | Settings | Template kode default per bahasa (dropdown + editor kecil), preferensi tema dan bahasa default |
| FR-13 | Status | Halaman monitoring kondisi grader, provider connection, dan extension |
| FR-14 | Extension Page | Halaman panduan instalasi dan status extension di browser |

### 4.2 Acceptance Criteria per Fitur

**FR-06 — Grader (Native Compiler)**
- Kode user disimpan ke file temporary di direktori aman (`/tmp/cphub-{runId}/`)
- C++ dikompilasi dengan GCC 14+ dari Arch Linux CachyOS (`g++ -std=c++17 -O2 -Wall -fsanitize=address,undefined`)
- Python 3.12+ dieksekusi langsung dengan time limit
- Node.js 22+ (JavaScript) dieksekusi langsung dengan time limit
- Java 21+ dikompilasi dengan `javac` dan dijalankan dengan `java`
- Eksekusi berlangsung di dalam firejail tanpa akses jaringan
- Output dibandingkan token-per-token setelah trim whitespace dan trailing newline
- Aggregate verdict: AC jika semua test case pass; WA/TLE/RE/CE berdasarkan kegagalan pertama
- Timeout 5 detik per eksekusi, memory limit 512 MB via `ulimit`
- Output maksimal 10 KB
- Maksimum 5 eksekusi grader berjalan bersamaan
- Antrian FIFO dikelola via Redis

---

## 5. System Architecture & Tech Stack

### 5.1 Tech Stack — Backend & Frontend Terpisah

**Backend — Golang** (server API, port 3001):
| Komponen | Teknologi |
|----------|-----------|
| Language | Go (Golang) 1.22+ |
| Web Framework | Fiber v2 |
| ORM | GORM |
| Migration | golang-migrate |
| Database | PostgreSQL 16 (Docker) |
| Cache | Redis 7 (Docker) |
| Grader | **Native Arch Linux CachyOS** — GCC 14+, Python 3.12+, Node.js 22+, Java 21+ |
| Sandbox | firejail |
| Auth | golang-jwt, bcrypt, Google OAuth 2.0 |

**Frontend — Next.js + Bun** (web dashboard, port 3000):
| Komponen | Teknologi |
|----------|-----------|
| Runtime / Package Manager | **Bun** |
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | **TailwindCSS** — utility classes langsung, tanpa CSS custom properties |
| State | Zustand |
| Editor | Monaco Editor (client-side only, dynamic import) |
| Theme | next-themes (dark/light toggle) |

**Extension — Browser** (side project):
| Komponen | Teknologi |
|----------|-----------|
| Runtime / Package Manager | **Bun** |
| Manifest | V3 |
| Build | Vite + TypeScript |
| Scraper | DOM parser per platform |

### 5.2 Perubahan Arsitektur dari V3

| Komponen | V3 | V4 |
|----------|----|----|
| Grader Engine | Piston API (Docker container) | **Kompiler native Arch Linux** — langsung panggil `g++`, `python3`, `node` via Go `os/exec` |
| Sandbox | Piston built-in (container isolation) | **firejail** — seccomp, no-network, private-tmp, noroot |
| Docker Dependensi | PostgreSQL, Redis, Piston (3 service) | PostgreSQL, Redis (2 service) — **Piston dihapus** |
| Kompilasi | Via Piston API HTTP | Fork + exec langsung — subprocess Go managed |
| Latensi Eksekusi | ~500ms (termasuk HTTP + container overhead) | **< 200ms** (native compile + exec) |

### 5.3 Monorepo Toolchain

Root `package.json` menggunakan **Bun** sebagai package manager dan task runner:

```json
{
  "name": "cphub",
  "private": true,
  "scripts": {
    "dev:api": "cd apps/api && go run ./cmd/main.go",
    "dev:web": "cd apps/web && bun dev",
    "dev:ext": "cd apps/extension && bun dev",
    "build:web": "cd apps/web && bun run build",
    "build:ext": "cd apps/extension && bun run build",
    "db:migrate": "cd apps/api && go run ./cmd/migrate.go",
    "infra:up": "docker compose -f docker/docker-compose.yml up -d",
    "infra:down": "docker compose -f docker/docker-compose.yml down"
  }
}
```

### 5.4 Alur Data

```
Browser Extension
      │  HMAC-signed POST
      ▼
Go API (Fiber, port 3001)
      │  GORM
      ▼
PostgreSQL 16
      │  Cache layer
      ▼
Redis 7
      │  WebSocket / REST
      ▼
Web Dashboard (Next.js, port 3000)
```

### 5.5 Docker Services

Hanya 2 service — PostgreSQL 16 dan Redis 7. Piston sudah dihapus.

```yaml
# docker-compose.yml — root monorepo
services:
  db:
    image: postgres:16-alpine
    container_name: cphub-db
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: cphub
      POSTGRES_PASSWORD: cphub
      POSTGRES_DB: cphub
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U cphub"]
      interval: 5s
      timeout: 3s
      retries: 5

  cache:
    image: redis:7-alpine
    container_name: cphub-cache
    ports:
      - "6379:6379"
    volumes:
      - redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

volumes:
  pgdata:
  redisdata:
```

**Piston tidak lagi digunakan.** Grader berjalan langsung di host Arch Linux CachyOS dengan kompiler native. Docker hanya untuk PostgreSQL dan Redis.

### 5.6 Icon System

Semua ikon menggunakan **lucide-react** — library icon open-source. Import ikon langsung di komponen:

```tsx
import { LayoutDashboard, Files, ClipboardList, Link, Settings, Activity, Puzzle, LogOut } from "lucide-react";

// Contoh sidebar item
<a className="flex items-center gap-[9px] px-[10px] py-[7px] rounded-[6px] text-[13px] text-[#71717a] hover:bg-[#1f1f23] hover:text-[#e4e4e7] transition-colors">
  <LayoutDashboard className="w-4 h-4" />
  Dashboard
</a>
```

Daftar ikon per route:

| Route | Ikon |
|-------|------|
| Dashboard | `LayoutDashboard` |
| Problemset | `Files` |
| Submission | `ClipboardList` |
| Connections | `Link` |
| Settings | `Settings` |
| Status | `Activity` |
| Extension | `Puzzle` |
| Logout | `LogOut` |
| Chevron (collapse) | `ChevronLeft` |
| Hamburger (mobile) | `Menu` |

### 5.7 next-themes Setup

Setup theme provider di root layout:

```tsx
// apps/web/src/app/layout.tsx
import { ThemeProvider } from "next-themes";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head />
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
```

Toggle button:

```tsx
"use client";
import { useTheme } from "next-themes";

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
      {theme === "dark" ? "🌙" : "☀️"}
    </button>
  );
}
```

### 5.8 Prasyarat Sistem (Arch Linux CachyOS)

Paket yang harus terinstall di sistem:
- `gcc` (GCC 14+)
- `python` (Python 3.12+)
- `nodejs` (Node.js 22+)
- `jdk21-openjdk` (Java 21+)
- `firejail` (sandbox isolasi)
- `make`, `cmake` (opsional)

Cek versi:
```bash
g++ --version   # GCC 14+
python3 --version
node --version
java --version
firejail --version
```

#### 5.8.1 Firejail Setup

Firejail digunakan sebagai sandbox untuk eksekusi kode grader. Berikut panduan instalasi dan konfigurasi di Arch Linux CachyOS.

**Instalasi:**
```bash
sudo pacman -S firejail
```

**Buat profile kustom untuk CPHub:**
```bash
sudo tee /etc/firejail/cphub.local > /dev/null <<'EOF'
# CPHub grader sandbox profile
net none
noroot
seccomp
timeout 5
caps.drop all
private-dev
private-tmp
read-only /usr
read-only /lib
read-only /lib64
EOF
```

**Verifikasi firejail berfungsi:**
```bash
# Test — no network access
firejail --net=none --noprofile ping google.com
# Expected: ping: socket: Operation not permitted

# Test — seccomp blocks dangerous syscalls
firejail --net=none --noprofile --seccomp bash -c "echo seccomp_ok"
# Expected: seccomp_ok

# Test — read-only /usr
firejail --net=none --noprofile touch /usr/test.txt
# Expected: touch: cannot touch '/usr/test.txt': Read-only file system
```

**Konfigurasi tambahan (direkomendasikan):**
```bash
# Batasi jumlah firejail instances
echo "cphub hard nproc 20" | sudo tee /etc/security/limits.d/cphub.conf

# Pastikan firejail suid bit
sudo chmod u+s /usr/bin/firejail
```

---

## 6. Database Schema

(Sama dengan V3 — tidak ada perubahan signifikan)

Entitas: User, LinkedAccount, Problem, TestCase, ProblemLog, LocalSubmission, ExternalSubmission, Snippet, UserSettings.

Relasi dan index identik dengan V3.

---

## 7. Browser Extension

### 7.1 Overview

Browser extension CPHub berfungsi sebagai jembatan antara halaman Codeforces / TLX TOKI di browser dengan CPHub API lokal. Extension melakukan scraping konten problem, submission, dan data user, lalu mengirimkannya ke API dengan HMAC authentication.

### 7.2 Tech Stack

| Komponen | Teknologi |
|----------|-----------|
| Runtime / Package Manager | **Bun** |
| Manifest | **V3** (service worker, no background page) |
| Build | **Vite** + TypeScript (multi-entry) |
| UI (Popup & Options) | React + TailwindCSS (dark theme #0f0f10) |
| Storage | `chrome.storage.local` + `chrome.storage.sync` |
| Messaging | `chrome.runtime.sendMessage` typed message bus |

### 7.3 Architecture

```
┌─────────────────────────────────────────────────┐
│                 Browser Extension               │
│                                                 │
│  ┌──────────────┐  ┌─────────────────────────┐  │
│  │ Content      │  │ Background SW           │  │
│  │ Scripts      │  │ (service-worker.ts)     │  │
│  │              │  │                         │  │
│  │ detector.ts  │  │ Message handler         │  │
│  │ codeforces.ts│  │ Sync orchestrator       │  │
│  │ tlx.ts       │  │ HMAC signer             │  │
│  │ observer.ts  │  │ Offline queue           │  │
│  │ selectors/   │  │ Rate limiter            │  │
│  │              │  │ Badge manager           │  │
│  │              │  │ Notification manager    │  │
│  │              │  │ Alarm (health ping)     │  │
│  └──────────────┘  └─────────────────────────┘  │
│                                                 │
│  ┌──────────────┐  ┌─────────────────────────┐  │
│  │ Popup        │  │ Options Page            │  │
│  │              │  │                         │  │
│  │ Sync tab     │  │ HMAC key management     │  │
│  │ Status tab   │  │ Connection test         │  │
│  │ Settings tab │  │ API base URL config     │  │
│  └──────────────┘  └─────────────────────────┘  │
│                                                 │
│  ┌──────────────────────────────────────────┐   │
│  │ Shared                                   │   │
│  │ crypto.ts / nonce.ts / api.ts            │   │
│  │ logger.ts / storage.ts / messages.ts     │   │
│  └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

### 7.4 Content Scripts — Scrapers

#### 7.4.1 Platform Support

| Platform | Problem | Submission | Profile | Session |
|----------|---------|------------|---------|---------|
| Codeforces | ✓ title, statement, I/O, constraints, tags, time/memory limit | ✓ verdict, runtime, memory, language, timestamp | ✓ handle, rating, max rating, avatar | — |
| TLX TOKI | ✓ title, statement (Markdown), I/O, constraints, tags | ✓ verdict, runtime, memory, language, timestamp | — | ✓ cookie-based session detection |

#### 7.4.2 Auto-Detection

- `detector.ts` mendeteksi URL pattern CF problem page (`codeforces.com/problemset/problem/*`, `codeforces.com/contest/*/problem/*`) dan TLX problem page (`tlx.toki.id/problems/*`)
- Auto-deteksi submission page URL untuk scraping submission history
- DOM Mutation Observer untuk navigasi SPA (CF dan TLX render client-side — React/Next.js)

#### 7.4.3 Versioned Selector Registry

- Selector per platform disimpan dalam registry terpisah (`selectors/codeforces.ts`, `selectors/tlx.ts`)
- Setiap versi selector punya fallback chain — jika selector A gagal, coba selector B
- Auto-log saat selector gagal → trigger review manual
- User bisa kirim report "scraper broken" via popup

### 7.5 Background Service Worker

#### 7.5.1 Lifecycle

- `install` event: inisialisasi storage, register alarm
- `activate` event: claim clients, bersihkan stale data
- Keep-alive via periodic ping setiap 5 menit (alarm API)
- Graceful shutdown: flush offline queue sebelum terminate

#### 7.5.2 Sync Orchestrator

```
Content Script scrape page
        │
        ▼
Background SW receive scrape result
        │
        ├─ Validate data completeness
        ├─ Sign payload with HMAC-SHA256
        ├─ Generate nonce (timestamp-based, Redis-checked server-side)
        ├─ POST to local CPHub API (port 3001)
        │     │
        │     ├─ 200 OK → update badge (green count), notify success
        │     ├─ 4xx/5xx → push to offline queue, notify error
        │     └─ Network error → push to offline queue
        │
        ▼
Return status to content script → DOM update (success indicator)
```

#### 7.5.3 Offline Queue

- Failed sync disimpan di `chrome.storage.local`
- Retry dengan exponential backoff (1s, 2s, 4s, 8s, max 60s)
- Maks 50 item dalam queue
- Queue diproses FIFO — auto-retry saat online terdeteksi
- Badge menampilkan queue count (orange jika ada pending)

#### 7.5.4 Rate Limiter

- Maks 1 sync request per detik
- Token bucket algorithm — burst max 3
- Queue overflow → warning di popup

#### 7.5.5 Notifications

- Chrome native notification (`chrome.notifications.create`)
- Tipe: sync sukses (problem title), sync error (reason), extension update available
- Notification action: click → buka CPHub web dashboard / popup
- User bisa disable per tipe notifikasi di options page

#### 7.5.6 Badge

- Badge text: jumlah problem tersinkron sesi ini (atau "!" jika error)
- Badge color: green (OK), orange (queue pending), red (error/lost connection)
- Reset badge count setiap hari (atau manual via popup)

### 7.6 Popup UI

#### 7.6.1 Layout

- **Header:** Logo CPHub + versi extension + dark/light toggle
- **Tab bar:** Sync | Status | Settings (3 tab)
- **Footer:** link ke CPHub dashboard + report bug

#### 7.6.2 Sync Tab

- "Sync This Problem" button (primary, full width) — hanya aktif jika tab aktif adalah halaman CF/TLX
- Last sync info: problem title + timestamp + status (success/fail)
- Recent sync list: 5 sync terakhir dengan icon status
- Manual sync all pending button

#### 7.6.3 Status Tab

- API connection status: dot indicator (green/red) + latency ms
- HMAC key status: configured / not configured
- Offline queue: count + list
- Last health ping timestamp
- Extension version + check update

#### 7.6.4 Settings Tab

- API base URL input (default: `http://localhost:3001`)
- HMAC secret input (masked, with show/hide toggle)
- Sync mode: Auto (detect page) / Manual (button only)
- Notification preferences (on/off per type)
- Reset extension data button

### 7.7 Options Page

Full-page settings diakses via `chrome://extensions` → "Extension Options" atau right-click icon → "Options".

- **HMAC Key Management:**
  - Generate new key (random 256-bit hex)
  - Input manual key (copy-paste dari CPHub settings)
  - Rotate key — simpan 2 key lama untuk grace period
  - Validate key — test sign + ping ke API
- **Connection Test:**
  - Ping API endpoint → tampilkan latency, status code, response time
  - Test HMAC auth → tampilkan valid/invalid
- **Data Management:**
  - Export settings JSON
  - Import settings JSON
  - Clear all local data

### 7.8 Keyboard Shortcuts

| Shortcut | Action | Manifest Key |
|----------|--------|--------------|
| `Ctrl+Shift+S` / `Cmd+Shift+S` | Sync current problem | `sync-current-problem` |
| `Ctrl+Shift+O` / `Cmd+Shift+O` | Open CPHub dashboard | `open-dashboard` |

Dikonfigurasi di `manifest.json` → `commands` — user bisa rebind di `chrome://extensions/shortcuts`.

### 7.9 Context Menu

Right-click pada halaman CF/TLX:

- **"Sync this problem to CPHub"** — trigger scrape + sync (sama seperti button)
- **"Sync all problems on this page"** — untuk problem listing page (CF problemset)
- Context menu hanya muncul jika URL match dengan pattern CF/TLX

Didaftarkan via `chrome.contextMenus.create` di background SW.

### 7.10 Security

| Layer | Implementasi |
|-------|-------------|
| CSP | `script-src 'self'` — no eval, no inline scripts |
| HMAC | SHA256 HMAC signature setiap request ke API |
| Nonce | Timestamp-based nonce, server verify anti-replay via Redis |
| Secret Storage | `chrome.storage.local` — tidak expose ke web pages |
| Content Script Isolation | `world: "ISOLATED"` — tidak bisa diakses page JS |
| Permissions | Minimal: `storage`, `alarms`, `notifications`, `contextMenus` |
| Host Permissions | Scoped: `https://codeforces.com/*`, `https://tlx.toki.id/*`, `http://localhost:3001/*` |

### 7.11 Build & Distribution

#### 7.11.1 Development

```bash
cd apps/extension && bun dev
# Vite watch mode — rebuild on change
# Load unpacked extension dari dist/ di chrome://extensions
```

- Hot reload content script via `chrome.runtime.reload()`
- Source map enabled di dev mode
- Logger verbose di dev, silent di production

#### 7.11.2 Production Build

```bash
cd apps/extension && bun run build
# Output: apps/extension/dist/ (unpacked) + dist.zip (Chrome Web Store)
```

- Minify + tree-shake
- Remove source maps
- Auto-bump version dari `package.json` ke `manifest.json`

#### 7.11.3 Chrome Web Store

- Listing assets: screenshot (1280x800), promo tiles, description, privacy policy
- Auto-publish via Chrome Web Store API (CI/CD optional)
- Version changelog di store listing

### 7.12 Error Handling

| Skenario | Handling |
|----------|----------|
| Scraper gagal (DOM berubah) | Fallback selector chain → log → tampilkan "scraper broken" di popup |
| API unreachable | Retry 3x → offline queue → badge red → notification |
| HMAC key not configured | Popup settings tab: prompt user input key dari CPHub settings |
| Rate limit exceeded | Queue request → tampilkan estimasi wait time |
| Chrome storage full | Hapus log lama → warning ke user |
| Service worker terminated | Alarm keep-alive — restart + reprocess queue |
| CSP block | Build-time check — no eval, no inline |

## 8. Code Editor & Template System

(Sama dengan V3 — tidak ada perubahan signifikan)

Monaco Editor, split-pane, template engine dengan `{cursor}`, `{problem_name}`, dll.

---

## 9. Local Grader — Native Compiler

### 9.1 Arsitektur Grader

Grader V4 tidak menggunakan Piston API (Docker). Kompilasi dan eksekusi dilakukan langsung di host menggunakan kompiler native Arch Linux CachyOS.

```
┌─────────────────────────────────────┐
│  Go Grader Service                  │
│                                     │
│  1. Terima request (code, lang,     │
│     test cases)                     │
│  2. Validasi & sanitize code        │
│  3. Buat temp dir: /tmp/cphub-$run  │
│  4. Tulis source code ke file       │
│  5. Compile (jika C++/Java)         │
│  6. Eksekusi via firejail           │
│  7. Capture stdout, stderr, exit    │
│  8. Compare output per test case    │
│  9. Hapus temp dir                  │
│ 10. Return verdict aggregate        │
└─────────────────────────────────────┘
```

### 9.2 Execution Engine

| Properti | Nilai |
|----------|-------|
| Engine | Kompiler native Arch Linux CachyOS |
| Sandbox | firejail |
| Jaringan | Diblokir via firejail `--net=none` |
| CPU Timeout | 5 detik per run (via `ulimit -t 5` + Go context.WithTimeout) |
| Memory Limit | 512 MB per run (via `ulimit -v $((512*1024))`) |
| Max Output | 10 KB |
| Temp Directory | `/tmp/cphub-{runId}/` — auto-cleanup setelah selesai |

### 9.3 Bahasa yang Didukung

| Bahasa (CPHub) | Runtime Arch CachyOS | Command |
|----------------|----------------------|---------|
| C++17 | GCC 14+ | `g++ -std=c++17 -O2 -Wall -fsanitize=address,undefined -o $bin $src` |
| C++20 | GCC 14+ | `g++ -std=c++20 -O2 -Wall -fsanitize=address,undefined -o $bin $src` |
| Python 3 | Python 3.12+ | `python3 $src` |
| Java 21 | OpenJDK 21 | `javac $src && java $class` |
| JavaScript | Node.js 22+ | `node $src` |

### 9.4 Alur Eksekusi Detail

1. **Validasi** — Periksa format kode dan bahasa, pastikan tidak melebihi batas ukuran (256 KB)
2. **Sanitasi** — Strip pola berbahaya (syscall langsung, network call, `fork`/`exec` berbahaya)
3. **Isolasi** — Buat direktori temporary `/tmp/cphub-{runId}/`, tulis source code
4. **Kompilasi** — Jika C++/Java, jalankan kompiler. Capture compile error. Jika gagal → return CE
5. **Eksekusi** — Jalankan binary/script di dalam firejail dengan:
   - `--net=none` (blokir jaringan)
   - `--timeout=5` (batas waktu)
   - `--seccomp` (filter syscall)
   - `ulimit` untuk memory dan CPU
6. **Capture** — Tangkap stdout, stderr, dan exit code via Go `os/exec`
7. **Perbandingan** — Compare output token-per-token setelah trim whitespace dan trailing newline
8. **Aggregate** — AC jika semua pass, WA/TLE/RE/CE berdasarkan kegagalan pertama
9. **Cleanup** — Hapus direktori temporary
10. **Response** — Return JSON dengan verdict, runtime, memory, dan hasil per test case

### 9.5 Concurrency & Queue

- Maksimum 5 eksekusi grader berjalan bersamaan (semaphore-based)
- Antrian FIFO dikelola via Redis (BRPOP)
- Setiap proses di-kill otomatis setelah 5 detik via Go context cancellation
- User diberi notifikasi jika queue penuh (HTTP 429) beserta estimasi waktu tunggu

### 9.6 Directory Structure (Temp)

```
/tmp/cphub-{runId}/
├── source.cpp        # Source code
├── solution          # Compiled binary (C++)
├── Solution.class    # Compiled class (Java)
├── testcases/
│   ├── 0.in
│   ├── 0.out
│   ├── 1.in
│   └── 1.out
└── run.sh            # Wrapper script untuk firejail
```

### 9.7 Keamanan Eksekusi

| Lapisan | Implementasi |
|---------|-------------|
| Filesystem | Temp dir dengan permission 0700, milik user cphub |
| Network | firejail `--net=none` — blokir total |
| Syscall | firejail seccomp profile default |
| Timeout | Go context deadline + `ulimit -t` |
| Memory | `ulimit -v` hard limit 512 MB |
| Output | PIPE buffer 10 KB, overflow → truncated + flag |
| Fork bomb | `ulimit -u` untuk membatasi proses child |
| Cleanup | `defer os.RemoveAll()` — tetap dijalankan meskipun panic |

### 9.8 Firejail Profile

```
# /etc/firejail/cphub.local
net none
noroot
seccomp
timeout 5
caps.drop all
private-dev
private-tmp
read-only /usr
read-only /lib
read-only /lib64
```

### 9.9 Process Management — Zombie Prevention & Signal Handling

Karena grader men-spawn subprocess (compiler + firejail + user binary), manajemen proses yang buruk bisa menyebabkan zombie processes atau file descriptor leak.

**Zombie Process Prevention:**

```go
// Go approach — reap child processes explicitly
cmd := exec.CommandContext(ctx, "firejail", args...)
cmd.SysProcAttr = &syscall.SysProcAttr{
    Setpgid: true,  // isolate in own process group
}

// Wait for process to finish — prevents zombies
err := cmd.Wait()

// Kill entire process group (children included)
syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
```

Aturan:
- Setiap `exec.CommandContext` WAJIB diikuti `cmd.Wait()` — jangan leak process handle
- Gunakan `Setpgid: true` agar kill signal menjangkau seluruh child process tree
- Jangan gunakan `cmd.Process.Kill()` saja — kill process group via `syscall.Kill(-pid, sig)`

**Signal Handling:**

| Signal | Action |
|--------|--------|
| SIGCHLD | Ignore atau reap via `cmd.Wait()` — default Go sudah handle |
| SIGTERM | Cancel semua running grader → `context.Cancel()` tiap run |
| SIGINT (Ctrl+C) | Sama seperti SIGTERM — graceful shutdown |
| SIGKILL | Last resort — systemd cleanup, temp dir mungkin tertinggal |

**Cleanup pada Graceful Shutdown:**

```go
func (s *GraderService) Shutdown() {
    ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
    defer cancel()

    // 1. Stop accepting new jobs
    // 2. Cancel all running exec contexts
    for _, run := range s.activeRuns {
        run.Cancel()  // kills firejail + binary
    }
    // 3. Wait for goroutines to finish
    // 4. Close Redis connection
    // 5. Log any remaining temp dirs for manual cleanup
}
```

**File Descriptor Safety:**
- Setiap stdin/stdout/stderr pipe WAJIB ditutup setelah `cmd.Wait()` kembali
- Gunakan `cmd.StdoutPipe()` dengan `cmd.Start()` → `cmd.Wait()` → pipe.Close()
- Jangan gunakan `cmd.CombinedOutput()` untuk long-running process (blocking)
- Limit open FDs via systemd: `LimitNOFILE=4096`

**Temp Directory Cleanup:**
```go
defer os.RemoveAll(tempDir)  // tetap jalan meskipun panic
// Fallback cron job untuk orphan temp dirs (opsional):
// 0 3 * * * find /tmp/cphub-* -mmin +60 -delete
```

---

## 10. Analytics Dashboard

(Sama dengan V3 — tidak ada perubahan signifikan)

Overview cards, progress chart, activity heatmap, tag weakness matrix, problem log, rating tracker.

---

## 11. Authentication & Account Linking

(Sama dengan V3 — tidak ada perubahan signifikan)

Email/password bcrypt, Google OAuth 2.0, JWT access + refresh token, CF OIDC, TLX extension verification.

---

## 12. API Specification

(Sama dengan V3 — daftar endpoint identik)

### Perubahan dari V3:
- Grader endpoint (`POST /api/grader/run`) sekarang langsung eksekusi native, tidak melalui Piston

---

## 13. Security Requirements

### 13.1 Eksekusi Kode (Perubahan dari V3)

V3 mengandalkan Piston (Docker container) untuk isolasi. V4 menggunakan firejail + Go native process management.

| Ancaman | Mitigasi V4 |
|---------|-------------|
| Arbitrary syscall | firejail seccomp profile — hanya allow syscall aman |
| Network access | firejail `--net=none` |
| Fork bomb | `ulimit -u 50` — maks 50 proses child |
| File system access | firejail `private-tmp`, `read-only /usr`, `read-only /lib` |
| Privilege escalation | firejail `noroot`, `caps.drop all` |
| Resource exhaustion | Go context timeout + `ulimit` CPU/memory/file |

### 13.2 Sanitasi Kode

Pola berbahaya yang di-strip sebelum eksekusi:
- `#include <filesystem>` (C++ — prevent file write via standard library)
- `std::system`, `std::popen`, `exec*`, `fork` (C++)
- `os.system`, `os.popen`, `subprocess`, `shutil` (Python)
- `Runtime.getRuntime().exec`, `ProcessBuilder` (Java)
- `child_process`, `fs.writeFileSync` with path traversal (Node.js)

---

## 14. Performance & Optimization

### 14.1 Grader Performance (Perubahan dari V3)

| Metrik | V3 (Piston Docker) | V4 (Native Arch) |
|--------|--------------------|------------------|
| Cold start (C++ compile) | ~500ms (include container) | < 200ms |
| Sequential 5 TC C++ | ~2.5s | < 1s |
| Python no-compile | ~300ms per run | < 50ms per run |
| Memory overhead | ~100MB per container | ~5MB per subprocess |
| Disk overhead | ~2GB (piston image) | 0 (pakai sistem) |

### 14.2 Caching (Redis)

(Identik dengan V3 — Redis untuk analytics cache, problem cache, template, nonce)

---

## 15. UI/UX Requirements

### 15.1 Sistem Tema — TailwindCSS

CPHub V4 menggunakan **TailwindCSS** sebagai framework utility-first. Semua token tema mockup didefinisikan di `tailwind.config.ts` sebagai ekstensi tema, bukan CSS variables manual.

Semua komponen menggunakan **Tailwind utility classes** langsung — `bg-[#0f0f10]`, `text-[#e4e4e7]`, `border-[rgba(255,255,255,0.08)]`, dll. Tidak ada inline CSS styles atau CSS custom properties untuk warna.

Tailwind daisyUI / next-themes untuk theme toggle. `data-theme` attribute di `<html>` mengontrol dark/light.

#### Konfigurasi Tailwind

File `tailwind.config.ts`:

```ts
export default {
  darkMode: "class", // atau data-theme via next-themes
  theme: {
    extend: {
      colors: {
        // Mockup exact palette
        bg: "#0f0f10",
        surface: "#18181b",
        "surface-2": "#1f1f23",
        "text-primary": "#e4e4e7",
        "text-secondary": "#71717a",
        "text-muted": "#52525b",
        accent: "#8b5cf6",
        "accent-hover": "#7c3aed",
        green: "#10b981",
        red: "#ef4444",
        yellow: "#f59e0b",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      // Dark mode override colors
      // Light mode override via .light class
    },
  },
};
```

#### Penerapan di Komponen — Contoh

```tsx
// Sidebar — setiap warna dari mockup, via Tailwind
<aside className="w-[220px] bg-[#18181b] border-r border-[rgba(255,255,255,0.08)] flex flex-col">
  <div className="flex items-center justify-between px-[14px] h-[44px] border-b border-[rgba(255,255,255,0.08)]">
    <span className="text-[16px] font-semibold text-[#8b5cf6]">CPHub</span>
  </div>
  <nav className="flex-1 p-[6px]">
    <a className="flex items-center gap-[9px] px-[10px] py-[7px] rounded-[6px] text-[13px] text-[#71717a] hover:bg-[#1f1f23] hover:text-[#e4e4e7]">
      Dashboard
    </a>
  </nav>
</aside>
```

#### Dark Mode — "Elegant Black & Purple"

| Elemen | Token | Nilai |
|--------|-------|-------|
| Background utama | `--bg` | **#0f0f10** |
| Surface (panel, card, topbar) | `--surface` | **#18181b** |
| Surface-2 (input, surface dalam) | `--surface-2` | **#1f1f23** |
| Border | `--border` | **rgba(255,255,255,0.08)** |
| Border hover | `--border-hover` | **rgba(255,255,255,0.16)** |
| Teks primer | `--text-primary` | **#e4e4e7** |
| Teks sekunder | `--text-secondary` | **#71717a** |
| Teks muted | `--text-muted` | **#52525b** |
| Warna aksen (purple) | `--accent` | **#8b5cf6** |
| Accent hover | `--accent-hover` | **#7c3aed** |
| Accent dim bg | `--accent-dim` | **rgba(139,92,246,0.15)** |
| Green (AC) | `--green` | **#10b981** |
| Red (WA) | `--red` | **#ef4444** |
| Yellow (TLE) | `--yellow` | **#f59e0b** |
| Sidebar width | `--sidebar-w` | **220px** |
| Topbar height | `--topbar-h` | **44px** |
| Font UI | `--sans` | **"Inter", system-ui, sans-serif** |
| Font kode | `--mono` | **"JetBrains Mono", "Fira Code", monospace** |
| Radius | `--radius-sm/md/lg` | **6px / 8px / 12px** |

#### Light Mode — "Fresh White"

| Elemen | Nilai |
|--------|-------|
| Background utama | #f4f4f5 |
| Surface | #ffffff |
| Surface-2 | #f9f9fb |
| Border | rgba(0,0,0,0.08) |
| Teks primer | #18181b |
| Teks sekunder | #71717a |
| Teks muted | #a1a1aa |
| Accent dim | rgba(139,92,246,0.1) |

### 15.2 Global App Shell — Layout Template untuk SEMUA Halaman

Mockup layout adalah **template global** yang dipakai semua halaman. Tidak ada halaman standalone — setiap route dirender di dalam shell yang sama.

```
┌──────────────────────────────────────────────────────────┐
│  ┌──────────────┬──────────────────────────────────────┐ │
│  │  SIDEBAR     │  TOPBAR (44px)                       │ │
│  │  220px       │  [Breadcrumb / Page Title] [Actions] │ │
│  │  ┌──────┐    ├──────────────────────────────────────┤ │
│  │  │Logo  │    │  CONTENT AREA (flex-1, overflow)     │ │
│  │  │      │    │                                      │ │
│  │  │Dashboard  │  Setiap halaman di-render di sini    │ │
│  │  │Problemset │  dengan layout konsisten              │ │
│  │  │  ├─Semua  │                                      │ │
│  │  │  ├─CF     │  Contoh:                              │ │
│  │  │  └─TLX    │  - Dashboard → cards + chart grid    │ │
│  │  │Submission │  - Problemset → filter bar + table    │ │
│  │  │Settings   │  - Settings → form sections           │ │
│  │  │Status     │  - Extension → install guide card     │ │
│  │  │Extension  │  - Status → component health cards    │ │
│  │  │           │  - Problem → split-pane view          │ │
│  │  │           │    (statement kiri, editor+grader kanan)│
│  │  └──────┘    │                                      │ │
│  │  Profile     │                                      │ │
│  │  Logout      │                                      │ │
│  └──────────────┴──────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

#### Rules Global Layout:

| Aturan | Spesifikasi |
|--------|-------------|
| Sidebar | Selalu ada di kiri, 220px, navigasi utama |
| Topbar | Selalu ada di atas, 44px, judul halaman + actions |
| Content | `flex-1`, `overflow-y-auto`, padding `14px` default |
| Background | `bg-[#0f0f10]` untuk semua halaman |
| Auth pages (login/register) | Layout terpisah — sentral, tanpa sidebar & topbar |

#### Topbar per Halaman:

| Halaman | Title | Actions |
|---------|-------|---------|
| Dashboard | "Dashboard" | — |
| Problemset (list) | "Problemset" | Filter, Search |
| Problemset (detail) | "{problem title}" | Lang select, Template, Reset, Theme, Run, Submit |
| Submission | "Submission" | Filter provider |
| Settings | "Settings" | Save |
| Status | "Status" | Refresh |
| Extension | "Extension" | — |
| Connections | "Connections" | — |

#### Topbar — Problem Detail (khusus):
Topbar problem detail memiliki actions lebih banyak: language select + Template/Reset/theme/Run/Submit — ini adalah SATU-SATUNYA halaman dengan topbar kompleks. Halaman lain topbar minimal (judul saja).

### 15.3 Komponen Shell

Semua komponen shell menggunakan CSS variables dari theme, bukan warna hardcoded.

#### Sidebar (`apps/web/src/components/layout/sidebar.tsx`)

| Bagian | Tailwind Classes |
|--------|-----------------|
| Container | `w-[220px] bg-[#18181b] border-r border-[rgba(255,255,255,0.08)] flex flex-col flex-shrink-0` |
| Logo | `text-[16px] font-semibold text-[#8b5cf6]` |
| Nav item | `flex items-center gap-[9px] px-[10px] py-[7px] rounded-[6px] text-[13px] text-[#71717a] hover:bg-[#1f1f23] hover:text-[#e4e4e7] transition-colors` |
| Nav item active | `bg-[rgba(139,92,246,0.15)] text-[#8b5cf6] font-medium` |
| Submenu | `pl-[37px] text-[12px] text-[#71717a]` |
| Profile | `flex items-center gap-[9px] p-[6px_4px] rounded-[8px] cursor-pointer hover:bg-[#1f1f23]` |
| Avatar | `w-8 h-8 rounded-full bg-[#8b5cf6] text-white text-[11px] font-semibold flex items-center justify-center` |
| Logout | `flex items-center gap-[7px] w-full p-[6px_4px] text-[12px] text-[#ef4444] hover:bg-[rgba(239,68,68,0.08)] rounded-[6px]` |

#### Topbar (`apps/web/src/components/layout/topbar.tsx`)

| Bagian | Tailwind Classes |
|--------|-----------------|
| Container | `h-[44px] border-b border-[rgba(255,255,255,0.08)] flex items-center gap-[10px] px-[14px] flex-shrink-0 bg-[#18181b]` |
| Title | `text-[14px] font-semibold text-[#e4e4e7] whitespace-nowrap` |
| Badge CF | `inline-flex items-center gap-1 px-[8px] py-[2px] rounded-full text-[11px] font-medium bg-[rgba(59,130,246,0.15)] text-[#60a5fa]` |
| Badge difficulty | `inline-flex items-center gap-1 px-[8px] py-[2px] rounded-full text-[11px] font-medium bg-[rgba(245,158,11,0.15)] text-[#fbbf24]` |
| Badge time | `inline-flex items-center gap-1 px-[8px] py-[2px] rounded-full text-[11px] font-medium bg-[#1f1f23] text-[#71717a] border border-[rgba(255,255,255,0.08)]` |
| Button default | `inline-flex items-center gap-[5px] px-[12px] py-[5px] rounded-[6px] text-[12px] font-medium bg-[#1f1f23] text-[#e4e4e7] border border-[rgba(255,255,255,0.16)] hover:bg-[#18181b] transition-colors` |

#### Content Area

- `flex-1 overflow-y-auto bg-[#0f0f10]`
- Setiap halaman bisa override padding atau layout internal
- Semua warna pakai Tailwind utility classes langsung, bukan CSS variables

### 15.4 Halaman yang Tidak Pakai Shell

Halaman auth (login, register, onboarding) tidak pakai sidebar + topbar. Layout sendiri — sentral, centered card.

### 15.5 Button System (Global) — Tailwind Classes

| Variant | Tailwind Classes | Usage |
|---------|-----------------|-------|
| `.btn` default | `inline-flex items-center gap-[5px] px-[12px] py-[5px] rounded-[6px] text-[12px] font-medium bg-[#1f1f23] border border-[rgba(255,255,255,0.16)] text-[#e4e4e7] hover:bg-[#18181b] transition-colors` | Submit, Save, Cancel |
| `.btn--primary` | `inline-flex items-center gap-[5px] px-[12px] py-[5px] rounded-[6px] text-[12px] font-medium bg-[#8b5cf6] text-white hover:bg-[#7c3aed] transition-colors` | Run, Save utama, Confirm |
| `.btn--ghost` | `bg-transparent border-transparent text-[#71717a] hover:bg-[#1f1f23] hover:text-[#e4e4e7] px-[8px] py-[4px] rounded-[6px] text-[12px] transition-colors` | Template, Reset, text-only |
| `.btn--danger` | `inline-flex items-center gap-[5px] px-[12px] py-[5px] rounded-[6px] text-[12px] font-medium bg-[rgba(239,68,68,0.1)] text-[#ef4444] border border-[rgba(239,68,68,0.2)] hover:bg-[rgba(239,68,68,0.18)] transition-colors` | Hapus, Putuskan koneksi |
| `:disabled` | `opacity-45 pointer-events-none` | — |
| `.select` | `px-[10px] py-[5px] rounded-[6px] text-[12px] font-medium bg-[#1f1f23] border border-[rgba(255,255,255,0.16)] text-[#e4e4e7] cursor-pointer outline-none focus:outline-2 focus:outline-[#8b5cf6]` | Language, filter |
| `.kbd` | `inline-flex items-center px-[5px] py-[1px] text-[10px] font-mono bg-[#1f1f23] border border-[rgba(255,255,255,0.16)] rounded-[4px] text-[#52525b]` | Shortcut indicator (Ctrl+Enter) |

### 15.6 Tema — Tailwind darkMode + next-themes

Theme system: `next-themes` dengan `attribute="class"`. Dark mode = default (`dark` class). Light mode = toggle ke `light` class.

Semua komponen menggunakan **Tailwind utility classes langsung** dengan warna eksak. Tidak ada CSS custom properties / `var(--*)`.

#### Dark Mode Colors (Default)

| Token | Tailwind Class |
|-------|---------------|
| Background | `bg-[#0f0f10]` |
| Surface | `bg-[#18181b]` |
| Surface-2 | `bg-[#1f1f23]` |
| Border | `border-[rgba(255,255,255,0.08)]` |
| Border hover | `border-[rgba(255,255,255,0.16)]` |
| Text primary | `text-[#e4e4e7]` |
| Text secondary | `text-[#71717a]` |
| Text muted | `text-[#52525b]` |
| Accent | `bg-[#8b5cf6]` / `text-[#8b5cf6]` |
| Accent hover | `hover:bg-[#7c3aed]` |
| Accent dim | `bg-[rgba(139,92,246,0.15)]` |
| Green | `text-[#10b981]` / `bg-[rgba(16,185,129,0.15)]` |
| Red | `text-[#ef4444]` / `bg-[rgba(239,68,68,0.15)]` |
| Yellow | `text-[#f59e0b]` / `bg-[rgba(245,158,11,0.15)]` |

#### Light Mode Colors (`html class="light"`)

| Token | Tailwind Class |
|-------|---------------|
| Background | `bg-[#f4f4f5]` |
| Surface | `bg-[#ffffff]` |
| Surface-2 | `bg-[#f9f9fb]` |
| Border | `border-[rgba(0,0,0,0.08)]` |
| Text primary | `text-[#18181b]` |
| Text secondary | `text-[#71717a]` |
| Text muted | `text-[#a1a1aa]` |
| Accent dim | `bg-[rgba(139,92,246,0.1)]` |

#### Example: Problem Detail Page avec Tailwind + lucide-react

```tsx
import { Files, LayoutDashboard, ClipboardList, LogOut, ChevronLeft, Activity, Puzzle, Play, Sun, Moon } from "lucide-react";

// Topbar
<div className="h-[44px] flex-shrink-0 flex items-center gap-[10px] px-[14px] bg-[#18181b] border-b border-[rgba(255,255,255,0.08)]">
  <h1 className="text-[14px] font-semibold text-[#e4e4e7] whitespace-nowrap">D. Good Schedule</h1>
  <span className="inline-flex items-center gap-1 px-[8px] py-[2px] rounded-full text-[11px] font-medium bg-[rgba(59,130,246,0.15)] text-[#60a5fa]">Codeforces</span>
  <span className="inline-flex items-center gap-1 px-[8px] py-[2px] rounded-full text-[11px] font-medium bg-[#1f1f23] text-[#71717a] border border-[rgba(255,255,255,0.08)]">2s / 512 MB</span>
  <div className="flex-1" />
  <button className="inline-flex items-center gap-[5px] px-[12px] py-[5px] rounded-[6px] text-[12px] font-medium bg-[#8b5cf6] text-white hover:bg-[#7c3aed] transition-colors">
    <Play className="w-3 h-3" /> Run
  </button>
</div>

// Sidebar with lucide icons
<aside className="w-[220px] bg-[#18181b] border-r border-[rgba(255,255,255,0.08)] flex flex-col flex-shrink-0 overflow-hidden">
  <div className="flex items-center justify-between px-[14px] h-[44px] border-b border-[rgba(255,255,255,0.08)]">
    <span className="text-[16px] font-semibold text-[#8b5cf6]">CPHub</span>
    <button className="text-[#52525b] hover:text-[#e4e4e7] p-1 rounded-[6px] hover:bg-[#1f1f23]">
      <ChevronLeft className="w-4 h-4" />
    </button>
  </div>
  <nav className="flex-1 p-[6px] space-y-[1px]">
    <a className="flex items-center gap-[9px] px-[10px] py-[7px] rounded-[6px] text-[13px] text-[#71717a] hover:bg-[#1f1f23] hover:text-[#e4e4e7] transition-colors">
      <LayoutDashboard className="w-4 h-4" />
      Dashboard
    </a>
    <a className="flex items-center gap-[9px] px-[10px] py-[7px] rounded-[6px] text-[13px] bg-[rgba(139,92,246,0.15)] text-[#8b5cf6] font-medium transition-colors">
      <Files className="w-4 h-4" />
      Problemset
    </a>
  </nav>
</aside>

// Grader tabs
<div className="flex border-b border-[rgba(255,255,255,0.08)] bg-[#18181b]">
  <button className="px-[14px] text-[12px] font-medium text-[#8b5cf6] border-b-2 border-[#8b5cf6] flex items-center gap-[5px] h-[34px]">Grader</button>
  <button className="px-[14px] text-[12px] text-[#71717a] hover:text-[#e4e4e7] border-b-2 border-transparent flex items-center gap-[5px] h-[34px]">
    Test Cases
    <span className="min-w-[16px] h-4 px-1 rounded-full text-[10px] font-semibold bg-[rgba(139,92,246,0.15)] text-[#8b5cf6] inline-flex items-center justify-center">4</span>
  </button>
</div>

// Resize handle
<div className="w-[5px] flex-shrink-0 cursor-col-resize bg-[rgba(255,255,255,0.08)] hover:bg-[#8b5cf6] transition-colors" />

// Verdict badge
<span className="inline-flex items-center gap-1 px-[8px] py-[2px] rounded-full text-[11px] font-semibold bg-[rgba(16,185,129,0.15)] text-[#34d399]">
  Accepted
</span>

// Sample box Use button
<button className="text-[11px] px-[6px] py-[2px] rounded-[4px] text-[#10b981] hover:bg-[rgba(16,185,129,0.1)] transition-colors">
  ↓ Use
</button>
```

### 15.7 Halaman Khusus — Problem Detail (Split Pane)

Hanya halaman ini yang punya split layout. Sisanya single-column.

Kolom resize handle: `w-[5px] cursor-col-resize bg-[rgba(255,255,255,0.08)] hover:bg-[#8b5cf6] transition-colors`. Dragging: `bg-[#8b5cf6]`.
Row resize handle: `h-[5px] cursor-row-resize bg-[rgba(255,255,255,0.08)] hover:bg-[#8b5cf6] transition-colors`. Dragging: `bg-[#8b5cf6]`.
Default split: 42% statement kiri, 58% editor kanan.
Bottom split: 60% editor atas, 40% grader bawah.
Invisible extended hit area: absolute `-left-1 -right-1` (col) / `-top-1 -bottom-1` (row).

### 15.8 Halaman Example — Layout per Page

#### Problemset List (`/problems`)

```
┌──────────────────────────────────────────────────────────┐
│  SIDEBAR    │  TOPBAR: "Problemset"  [Filter] [Search]  │
│             ├────────────────────────────────────────────┤
│             │  Card: filter pills (provider, tag, diff)  │
│             │  ┌──────┬──────┬──────┬──────┬──────┐      │
│             │  │ No   │ Soal │ Diff │ Tags │Stat  │      │
│             │  ├──────┼──────┼──────┼──────┼──────┤      │
│             │  │ 1    │ 1456A│ 800  │ dp   │ ✓    │      │
│             │  │ 2    │ 1456B│ 1200 │ greedy│ ○    │      │
│             │  └──────┴──────┴──────┴──────┴──────┘      │
└──────────────────────────────────────────────────────────┘
```

#### Dashboard (`/dashboard`)

```
┌──────────────────────────────────────────────────────────┐
│  SIDEBAR    │  TOPBAR: "Dashboard"                       │
│             ├────────────────────────────────────────────┤
│             │  ┌──────────┬──────────┬──────────┐        │
│             │  │ Solved   │ Streak   │ Accuracy │        │
│             │  │   342    │   7 hari │   68%    │        │
│             │  └──────────┴──────────┴──────────┘        │
│             │  ┌──────────────────────────────────┐       │
│             │  │ Rating Chart (line)               │       │
│             │  └──────────────────────────────────┘       │
│             │  ┌────────────┐  ┌──────────────────┐       │
│             │  │ Heatmap    │  │ Tag Weakness     │       │
│             │  │ (calendar) │  │ (table)          │       │
│             │  └────────────┘  └──────────────────┘       │
└──────────────────────────────────────────────────────────┘
```

#### Submission (`/submissions`)

```
┌──────────────────────────────────────────────────────────┐
│  SIDEBAR    │  TOPBAR: "Submission"  [Filter provider]   │
│             ├────────────────────────────────────────────┤
│             │  ┌──────┬──────┬──────┬────┬────┬────┐     │
│             │  │ Soal │ Ver.│ Lang │ OJ │Run │Mem │     │
│             │  ├──────┼──────┼──────┼────┼────┼────┤     │
│             │  │ 1456A│  AC  │ C++  │ CF │12ms│4MB │     │
│             │  │ 1456B│  WA  │ Py   │ TLX│—   │—   │     │
│             │  └──────┴──────┴──────┴────┴────┴────┘     │
└──────────────────────────────────────────────────────────┘
```

#### Settings (`/settings`)

```
┌──────────────────────────────────────────────────────────┐
│  SIDEBAR    │  TOPBAR: "Settings"              [Save]   │
│             ├────────────────────────────────────────────┤
│             │  ┌──────────────────────────────────────┐  │
│             │  │ Default Template per Bahasa          │  │
│             │  │ [C++20 ▼]                            │  │
│             │  │ ┌──────────────────────────────────┐ │  │
│             │  │ │ Editor kecil untuk template       │ │  │
│             │  │ └──────────────────────────────────┘ │  │
│             │  └──────────────────────────────────────┘  │
│             │  ┌──────────────────────────────────────┐  │
│             │  │ Preferensi                           │  │
│             │  │ ☐ Auto-sync extension               │  │
│             │  │ Theme: ○ Light  ○ Dark  ○ System     │  │
│             │  └──────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

#### Status (`/status`)

```
┌──────────────────────────────────────────────────────────┐
│  SIDEBAR    │  TOPBAR: "Status"  [Refresh]               │
│             ├────────────────────────────────────────────┤
│             │  ┌──────────────────────────────────────┐  │
│             │  │ Overall: ○ OK                        │  │
│             │  ├──────────────────────────────────────┤  │
│             │  │ ┌──────────┐ ┌──────────┐           │  │
│             │  │ │Database  │ │Cache     │           │  │
│             │  │ │ ● OK     │ │ ● OK     │           │  │
│             │  │ │ 2ms      │ │ 1ms      │           │  │
│             │  │ └──────────┘ └──────────┘           │  │
│             │  │ ┌──────────┐ ┌──────────┐           │  │
│             │  │ │Grader    │ │Extension │           │  │
│             │  │ │ ● OK     │ │ ● OK v1.2│           │  │
│             │  │ └──────────┘ └──────────┘           │  │
│             │  │ ┌──────────┐ ┌──────────┐           │  │
│             │  │ │CF        │ │TLX       │           │  │
│             │  │ │ ● OK     │ │ ● OK     │           │  │
│             │  │ └──────────┘ └──────────┘           │  │
│             │  └──────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

#### Connections (`/connections`)

Halaman untuk manage akun terhubung. Setiap provider punya card status, tombol Link/Unlink.

```
┌──────────────────────────────────────────────────────────┐
│  SIDEBAR    │  TOPBAR: "Connections"                      │
│             ├────────────────────────────────────────────┤
│             │  ┌──────────────────────────────────────┐  │
│             │  │ Codeforces  ● Connected     [Unlink] │  │
│             │  │ andikanugraha                         │  │
│             │  │ Rating: 1427 (max 1562)               │  │
│             │  └──────────────────────────────────────┘  │
│             │  ┌──────────────────────────────────────┐  │
│             │  │ TLX TOKI     ○ Not Connected [Link]  │  │
│             │  │ Hubungkan akun TLX via browser       │  │
│             │  │ extension untuk mulai sync problem.  │  │
│             │  └──────────────────────────────────────┘  │
│             │  ┌──────────────────────────────────────┐  │
│             │  │ Google        ● Connected     [Unlink]│  │
│             │  │ andika@gmail.com                     │  │
│             │  └──────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

Connections page berisi daftar akun yang terhubung (CF via OIDC, TLX via extension, Google OAuth). Setiap provider card menampilkan status (connected/not connected), username, rating (CF), dan tombol Link/Unlink.

#### Onboarding (`/onboarding`)

Halaman tanpa sidebar/topbox — centered card, muncul setelah registrasi/login pertama.

```
┌──────────────────────────────────────────────────────────┐
│  ┌────────────────────────────────────────────────────┐  │
│  │                                                    │  │
│  │           Selamat Datang di CPHub V4!              │  │
│  │                                                    │  │
│  │   ┌──────────────────────────────────────────┐     │  │
│  │   │  1. Hubungkan akun Codeforces            │     │  │
│  │   │     Klik "Link" untuk OAuth               │     │  │
│  │   └──────────────────────────────────────────┘     │  │
│  │   ┌──────────────────────────────────────────┐     │  │
│  │   │  2. Install browser extension            │     │  │
│  │   │     Chrome Web Store atau manual          │     │  │
│  │   └──────────────────────────────────────────┘     │  │
│  │   ┌──────────────────────────────────────────┐     │  │
│  │   │  3. Sync problem pertamamu               │     │  │
│  │   │     Buka soal CF, klik sync               │     │  │
│  │   └──────────────────────────────────────────┘     │  │
│  │                                                    │  │
│  │            [   Mulai Dashboard   ]                  │  │
│  │                                                    │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

Onboarding adalah halaman tanpa sidebar/topbar (termasuk dalam pengecualian 15.4). Muncul setelah registrasi/login pertama. Layout centered card dengan step-by-step guide langkah awal menggunakan CPHub.

### 15.9 Responsive

| Viewport | Sidebar | Split |
|----------|---------|-------|
| Desktop ≥ 1280px | Fixed expanded | Horizontal split (problem page) |
| Tablet 768–1279px | Collapsible icon-mode | Stack vertical |
| Mobile < 768px | Hidden (overlay) | Stack vertical, samples single column |

### 15.10 Scrollbar — globals.css

Scrollbar styling tetap di `globals.css` (Tailwind tidak support pseudo-elements):

```css
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.16); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: #71717a; }
```

### 15.11 Typography

| Konteks | Font |
|---------|------|
| UI umum (body, label, heading) | Inter, system-ui, sans-serif |
| Editor kode, sample boxes, grader output | JetBrains Mono, Fira Code, monospace |
| Formula matematika | KaTeX |

### 15.12 Accessibility

- Full keyboard navigation: Tab, Enter, Esc
- ARIA label pada semua elemen interaktif
- Focus ring: accent color, offset 1px
- Color contrast ratio minimum 4.5:1 untuk teks normal

---

## 16. Testing & Quality Assurance

(Sama dengan V3 — unit test Go, integration, E2E Playwright)

### Perubahan dari V3:
- **Grader test:** Eksekusi C++ langsung di host, bukan via Piston API. Test memanggil binary hasil kompilasi.
- **Firejail test:** Verifikasi sandbox berfungsi (block network, block file write).
- **Safety test:** Coba kirim kode berbahaya (`fork()`, `system("rm -rf /")`) → pastikan blocked.

---

## 17. Development Workflow & Deployment

### 17.1 Prerequisites

- **Arch Linux CachyOS** (atau Arch Linux turunan)
- Go 1.22+
- Node.js 20+ (Bun)
- Docker dan Docker Compose (untuk PostgreSQL & Redis)
- **GCC 14+, Python 3.12+, Node.js 22+, JDK 21+** (untuk grader)
- **firejail** (untuk sandbox)

### 17.2 Setup Awal

1. Clone repository
2. Copy `.env.example` ke `.env.local`
3. Install system dependencies:
   ```bash
   sudo pacman -S gcc python nodejs jdk21-openjdk firejail
   ```
4. Jalankan Docker services: `docker compose up -d` (PostgreSQL + Redis)
5. Jalankan migrasi database
6. Jalankan API: `go run ./apps/api/cmd/main.go`
7. Jalankan frontend: `bun dev` dari `apps/web`

### 17.3 Script Utama

| Script | Aksi |
|--------|------|
| `infra:up` | Jalankan Docker services (PostgreSQL + Redis) |
| `infra:down` | Hentikan Docker services |
| `dev:api` | Jalankan Go API server |
| `dev:web` | Jalankan Next.js dev server |
| `test:api` | Jalankan semua test Go (termasuk grader native) |

---

## 18. Roadmap & Milestones

### Phase 1 — Foundation (Minggu 1–3)

- Auth: Email/password + Google OAuth (Go backend)
- Database schema + Docker (PostgreSQL, Redis)
- Extension scaffold + basic Codeforces scraper
- Problem sync endpoint dengan HMAC verification
- Editor dasar: Monaco + substitusi template

### Phase 2 — Core Features (Minggu 4–7)

- CF OIDC linking + provider sidebar
- TLX extension verification (session detection + HMAC)
- **Grader native: C++ support via GCC, AC/WA/TLE/CE verdict**
- **Firejail sandbox integration**
- Split-view UI: statement + editor dengan template per bahasa
- Auto-save 300ms debounce + test case manager
- Sidebar dinamis (submenu per provider)

### Phase 3 — Enhancement (Minggu 8–10)

- Multi-language grader: Python, Java, JavaScript (native)
- Diff viewer side-by-side
- Dashboard analytics: rating chart, heatmap, tag weakness
- Submission history page (CF API, TLX extension)
- Settings: default template per bahasa
- Status page, Extension page
- **Implementasi mockup UI persis (dark #0f0f10 + light #f4f4f5)**
- Keyboard shortcuts lengkap

### Phase 4 — Polish & QA (Minggu 11–12)

- Background sync queue via Redis
- Error monitoring + alerting
- Full E2E test suite (Playwright)
- **Grader stress test: 10 concurrent C++ compile + exec**
- **Firejail security audit**
- Dokumentasi pengguna + developer guide

---

## 19. Risk & Mitigation

| # | Risiko | Dampak | Mitigasi |
|---|--------|--------|----------|
| R-01 | Firejail sandbox tidak cukup isolasi | Code berbahaya bisa akses sistem | Seccomp strict, audit rutin, test keamanan di CI |
| R-02 | Kompiler crash karena OOM | Sistem tidak responsif | `ulimit` hard limit, Go context timeout, queue max 5 |
| R-03 | Arch Linux rolling update broken kompiler | Grader tidak bisa kompilasi | Catat versi kompiler di status page, fallback ke error message jelas |
| R-04 | firejail tidak terinstall | Grader jalan tanpa sandbox | Deteksi saat startup, tolak eksekusi tanpa sandbox |
| R-05 | CF/TLX mengubah struktur HTML | Scraping gagal | Versioned scraper, selector fallback, manual input fallback |
| R-06 | Database bloat | Query lambat | TTL untuk log lama, VACUUM ANALYZE cron, pagination |

---

## 20. Glossary

(Sama dengan V3 + beberapa tambahan)

| Term | Definisi |
|------|----------|
| **firejail** | SUID tool untuk menjalankan program dalam sandbox Linux yang membatasi akses file, network, dan syscall |
| **firejail-profile** | Konfigurasi firejail kustom untuk CPHub — `net none`, `seccomp`, `private-tmp`, `caps.drop all` |
| **Native Compiler** | Kompiler yang terinstall langsung di sistem operasi host, bukan dalam container |
| **Arch Linux CachyOS** | Distribusi Linux berbasis Arch dengan optimasi performa (x86-64-v3, scheduler BORE) |

---

## 21. Error Codes & Error Catalog

(Sama dengan V3 — semua error code identik)

### Tambahan error code spesifik V4:

| Code | HTTP | Deskripsi | Tindakan Frontend |
|------|------|-----------|-------------------|
| `GRADER_COMPILER_UNAVAILABLE` | 503 | Kompiler tidak ditemukan di PATH | Tampilkan error + panduan install |
| `GRADER_SANDBOX_UNAVAILABLE` | 503 | firejail tidak terinstall atau error | Tampilkan error + panduan install firejail |
| `GRADER_CODE_TOO_LARGE` | 413 | Kode melebihi 256 KB | Tampilkan batas ukuran |
| `GRADER_TEMP_DIR_FAILED` | 500 | Gagal membuat direktori temporary | Coba lagi |

---

## 22. WebSocket Contract

(Sama dengan V3 — grader result di-stream via WebSocket)

---

## 23. Response Schema per Endpoint

(Sama dengan V3)

---

## 24. Extension Versioning & Update Strategy

(Sama dengan V3)

---

## 25. Data Retention Policy

(Sama dengan V3)

---

## 26. Onboarding Flow

(Sama dengan V3)

---

## 27. Acceptance Criteria Lengkap — Status & Extension Page

(Sama dengan V3)

### Perubahan: Komponen grader di status page
- Nama: "Grader (Native — Arch Linux)"
- Status: OK jika all compilers available; DEGRADED jika ada compiler missing; ERROR jika firejail tidak terinstall
- Detail: versi GCC, Python, Node.js, Java — ditampilkan di card

---

## 28. Definition of "Degraded" — Status Komponen

### 28.3 Grader (Native Arch)

| Kondisi | Status |
|---------|--------|
| Semua compiler tersedia, firejail OK, antrian 0–3/5 | `ok` |
| 1+ compiler tidak tersedia (misal Java belum install) | `degraded` |
| Antrian 4–5/5 | `degraded` |
| firejail tidak terinstall atau tidak berfungsi | `error` |
| Eksekusi terakhir gagal karena sistem | `degraded` |

### Komponen lain — identik dengan V3 (Database, Cache, Provider, Extension)

---

## 29. Struktur Folder Monorepo

### 29.1 Full Tree V4

```
competitive-hub-v4/
├── .env.example
├── docker-compose.yml            # PostgreSQL + Redis only (no Piston)
├── package.json                  # Workspace root (Bun)
├── apps/
│   ├── api/                      # Go backend (Fiber v2)
│   │   ├── cmd/
│   │   │   └── main.go
│   │   ├── internal/
│   │   │   ├── config/
│   │   │   ├── database/
│   │   │   ├── dto/
│   │   │   ├── grader/           # Native compiler engine
│   │   │   │   ├── executor.go   # os/exec wrapper + firejail
│   │   │   │   ├── languages.go  # Compiler flags
│   │   │   │   ├── queue.go      # Redis FIFO
│   │   │   │   ├── sanitizer.go  # Code sanitization
│   │   │   │   └── sandbox.go    # Firejail wrapper
│   │   │   ├── handler/
│   │   │   ├── middleware/
│   │   │   ├── model/
│   │   │   ├── provider/
│   │   │   ├── repository/
│   │   │   ├── server/
│   │   │   └── service/
│   │   └── go.mod
│   ├── web/                      # Next.js + Bun (Frontend)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── tailwind.config.ts
│   │   ├── next.config.ts
│   │   └── src/
│   │       ├── app/
│   │       │   ├── layout.tsx             # ThemeProvider wrapper
│   │       │   ├── globals.css            # Scrollbar + animations
│   │       │   ├── (auth)/               # Login, Register (no shell)
│   │       │   │   ├── login/
│   │       │   │   ├── register/
│   │       │   │   └── onboarding/
│   │       │   └── (app)/                # App pages (with shell)
│   │       │       ├── layout.tsx         # Sidebar + Topbar shell
│   │       │       ├── dashboard/
│   │       │       ├── problems/
│   │       │       │   └── [id]/
│   │       │       │       └── page.tsx   # Split pane editor
│   │       │       ├── submissions/
│   │       │       ├── connections/
│   │       │       ├── settings/
│   │       │       ├── status/
│   │       │       └── extension/
│   │       └── components/
│   │           ├── editor/               # Monaco, split-pane
│   │           ├── grader/               # GraderPanel, TestCaseManager
│   │           ├── shell/                # Sidebar, Topbar
│   │           └── ui/                   # Button, Skeleton, EmptyState
│   └── extension/                # Browser extension (Bun + Vite)
│       ├── manifest.json
│       ├── package.json
│       └── src/
│           ├── background/
│           ├── content/
│           │   ├── codeforces.ts
│           │   └── tlx.ts
│           └── popup/
```

### 29.2 Perubahan pada `apps/api/internal/grader/`

```
apps/api/internal/grader/
├── executor.go           # [NEW] os/exec wrapper + firejail (pengganti piston_client.go)
├── exec.go               # [NEW] — eksekusi native via os/exec + firejail
├── languages.go          # [SAME] — definisi bahasa + kompiler flags
├── queue.go              # [SAME] — Redis-based FIFO queue
├── sanitizer.go          # [SAME] — sanitasi kode
└── sandbox.go            # [NEW] — firejail wrapper + profile management
```

**File yang dihapus:** `piston_client.go` — tidak lagi digunakan karena grader native tidak memerlukan Piston API.
**File baru:** `exec.go`, `sandbox.go` — eksekusi langsung via `os/exec` dengan isolasi firejail.

---

## 30. Provider-Extensible Architecture

(Sama dengan V3 — register once, appear everywhere)

---

*Dokumen ini adalah living document. Perbarui setiap akhir sprint atau saat terjadi perubahan scope yang signifikan.*

**Status Dokumen:** ✅ **Complete** — semua 30 section telah diisi. Semua perubahan V3→V4 telah didokumentasikan: native compiler grader, firejail sandbox, mockup-exact UI/UX, TailwindCSS-only styling, docker-compose tanpa Piston, firejail setup guide, grader process management, Connections/Onboarding page layout, folder structure V4.

**Changelog:**

| Versi | Tanggal | Perubahan |
|-------|---------|-----------|
| 4.0.0 | 2026-06-12 | Initial V4 release — native compiler grader (Arch Linux CachyOS), firejail sandbox, mockup-exact UI/UX, TailwindCSS-only styling, docker-compose tanpa Piston, firejail setup guide, grader process management, Connections/Onboarding page layout, folder structure V4 |

**Kontak:** Andika Pratama · Universitas Sam Ratulangi · github.com/IDika31
