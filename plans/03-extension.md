# 03 — Browser Extension (`apps/extension/`)

> **Status:** 🔵 (13/43) — Foundation + Background SW done

---

## 3.1 Foundation

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| EXT-01 | Init extension project (Bun + Vite + TypeScript) | ✅ | `apps/extension/package.json` |
| EXT-02 | Manifest V3 — permissions, host_permissions, content_scripts, background, popup | ✅ | `apps/extension/manifest.json` |
| EXT-03 | Vite build config — multi-entry (background, content, popup), HMR, code splitting | ✅ | `apps/extension/vite.config.ts` |
| EXT-04 | TypeScript strict config + shared types package | ✅ | `apps/extension/tsconfig.json` |
| EXT-05 | CSP compliance — `script-src 'self'`, no eval, no inline | ✅ | `apps/extension/manifest.json` |
| EXT-06 | Ikon set — 16/48/128 + action icon + badge | ⬜ | `apps/extension/public/icons/` |

## 3.2 Shared / Utilities

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| EXT-07 | HMAC-SHA256 signing utility | ✅ | `apps/extension/src/shared/crypto.ts` |
| EXT-08 | Nonce generator + anti-replay (timestamp-based) | ✅ | `apps/extension/src/shared/crypto.ts` |
| EXT-09 | API client — POST ke local CPHub API dengan retry + timeout | ✅ | `apps/extension/src/shared/api.ts` |
| EXT-10 | Logger utility — level-based (debug/info/warn/error), console + storage log | ✅ | `apps/extension/src/shared/logger.ts` |
| EXT-11 | Storage wrapper — chrome.storage.local + chrome.storage.sync | ✅ | `apps/extension/src/shared/storage.ts` |
| EXT-12 | Message bus — typed message passing antar extension context | ✅ | `apps/extension/src/shared/messages.ts` |

## 3.3 Content Scripts — Scrapers

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| EXT-13 | Auto-detect halaman soal — CF problem page + TLX problem page | ✅ | `apps/extension/src/content/detector.ts` |
| EXT-14 | Codeforces problem scraper — title, statement, I/O, constraints, tags, time/memory limit | ⬜ | `apps/extension/src/content/codeforces.ts` |
| EXT-15 | Codeforces submission scraper — verdict, runtime, memory, language, timestamp | ⬜ | `apps/extension/src/content/codeforces.ts` |
| EXT-16 | Codeforces user profile scraper — handle, rating, max rating, avatar | ⬜ | `apps/extension/src/content/codeforces.ts` |
| EXT-17 | TLX problem scraper — title, statement (Markdown), I/O, constraints, tags, time/memory limit | ⬜ | `apps/extension/src/content/tlx.ts` |
| EXT-18 | TLX submission scraper — verdict, runtime, memory, language, timestamp | ⬜ | `apps/extension/src/content/tlx.ts` |
| EXT-19 | TLX session detection — cookie/session verifikasi user | ⬜ | `apps/extension/src/content/tlx.ts` |
| EXT-20 | Versioned scraper registry — selector per platform version, automatic fallback | ⬜ | `apps/extension/src/content/selectors/` |
| EXT-21 | DOM mutation observer — deteksi page navigation SPA (CF/TLX render client-side) | ⬜ | `apps/extension/src/content/observer.ts` |

## 3.4 Background Service Worker

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| EXT-22 | Service worker lifecycle — install, activate, keep-alive via periodic ping | ✅ | `apps/extension/src/background/index.ts` |
| EXT-23 | Message handler — route content script → background → API calls | ⬜ | `apps/extension/src/background/handler.ts` |
| EXT-24 | Sync orchestrator — terima scrape result → sign HMAC → POST ke API → return status | ⬜ | `apps/extension/src/background/sync.ts` |
| EXT-25 | Offline queue — simpan failed sync ke storage, retry saat online | ⬜ | `apps/extension/src/background/offline-queue.ts` |
| EXT-26 | Rate limiter — maks 1 sync per detik, queue overflow → warning | ⬜ | `apps/extension/src/background/rate-limiter.ts` |
| EXT-27 | Badge manager — update icon badge (synced count / error) | ⬜ | `apps/extension/src/background/badge.ts` |
| EXT-28 | Notification manager — toast native Chrome notification (sync sukses, error, update) | ⬜ | `apps/extension/src/background/notifications.ts` |
| EXT-29 | Alarm — periodic health ping ke CPHub API (setiap 5 menit) | ⬜ | `apps/extension/src/background/alarm.ts` |

## 3.5 Popup UI

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| EXT-30 | Popup layout — header (logo + version), tabs (Sync / Status / Settings) | ⬜ | `apps/extension/src/popup/index.html` + `App.tsx` |
| EXT-31 | Sync tab — "Sync Current Problem" button, last sync info, recent sync list | ⬜ | `apps/extension/src/popup/SyncTab.tsx` |
| EXT-32 | Status tab — API connection status, extension version, HMAC key status, offline queue count | ⬜ | `apps/extension/src/popup/StatusTab.tsx` |
| EXT-33 | Settings tab — API base URL, HMAC secret input, sync mode toggle (auto/manual) | ⬜ | `apps/extension/src/popup/SettingsTab.tsx` |
| EXT-34 | Popup dark mode — match CPHub dark theme (#0f0f10, #18181b, #8b5cf6) | ⬜ | `apps/extension/src/popup/styles/` |
| EXT-35 | Error boundary + empty states — popup tiap tab | ⬜ | `apps/extension/src/popup/ErrorBoundary.tsx` |

## 3.6 Options Page

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| EXT-36 | Options page layout — full-page settings (manifest `options_page`) | ⬜ | `apps/extension/src/options/index.html` + `Options.tsx` |
| EXT-37 | HMAC key management — generate, rotate, validate | ⬜ | `apps/extension/src/options/HmacKey.tsx` |
| EXT-38 | Connection test — ping CPHub API, tampilkan latency + status | ⬜ | `apps/extension/src/options/ConnectionTest.tsx` |

## 3.7 Keyboard Shortcuts & Context Menu

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| EXT-39 | Keyboard shortcut — `Ctrl+Shift+S` sync current problem | ⬜ | `apps/extension/manifest.json` (commands) |
| EXT-40 | Context menu — right-click "Sync this problem to CPHub" pada halaman CF/TLX | ⬜ | `apps/extension/src/background/context-menu.ts` |

## 3.8 Build & Distribution

| ID | Task | Status | File/Lokasi |
|----|------|--------|-------------|
| EXT-41 | Production build — minify, tree-shake, zip output | ⬜ | `apps/extension/vite.config.ts` |
| EXT-42 | Version bump script — sync manifest.json + package.json | ⬜ | `apps/extension/scripts/version.ts` |
| EXT-43 | Chrome Web Store — listing assets (screenshot, description, privacy policy) | ⬜ | `apps/extension/store/` |
