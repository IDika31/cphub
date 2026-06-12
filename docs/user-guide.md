# CPHub V4 — User Guide

## Setup Awal

1. Login dengan Email/Password atau Google OAuth
2. Setelah login pertama, ikuti onboarding 3 langkah:
   - Hubungkan akun Codeforces via OIDC
   - Install browser extension
   - Sync problem pertamamu

## Menghubungkan Akun

### Codeforces
1. Buka **Connections** page
2. Klik **Link** pada card Codeforces
3. Login ke akun Codeforces di browser
4. Akun otomatis terhubung

### TLX TOKI
1. Buka **Connections** page
2. Klik **Link** pada card TLX
3. Buka profil TLX di browser
4. Extension auto-detect sesi → verifikasi selesai

## Sync Problems

1. Install CPHub extension
2. Buka halaman problem Codeforces atau TLX di browser
3. Extension auto-detect → klik Sync di popup
4. Problem muncul di **Problemset** page

## Coding & Grader

1. Buka problem dari Problemset
2. Editor split-view: statement kiri, editor+grader kanan
3. Pilih bahasa dari dropdown (C++17, C++20, Python, Java, Node.js)
4. Tulis kode, template otomatis tersedia
5. Klik **Run** (atau Ctrl+Enter) untuk eksekusi
6. Hasil grader: AC/WA/TLE/RE/CE dengan diff viewer

## Fitur Utama

### Dashboard
- Overview: total solved, streak, accuracy
- Rating chart (Codeforces)
- Activity heatmap kalender
- Tag weakness analysis

### Problemset
- Filter per provider, difficulty, tag, status
- Full-text search
- Klik problem untuk buka di editor

### Submissions
- Riwayat submission lokal + eksternal (CF, TLX)
- Filter per provider

### Settings
- Template default per bahasa (5 bahasa)
- Preferensi tema (Dark/Light/System)
- Auto-sync toggle

### Status
- Monitoring komponen: DB, Cache, Grader, Extension, CF, TLX

### Extension
- Panduan install
- Keyboard shortcuts: Ctrl+Shift+S (sync), Ctrl+Shift+O (dashboard)

## Keyboard Shortcuts

| Shortcut | Aksi |
|----------|------|
| `Ctrl+Shift+S` | Sync current problem (extension) |
| `Ctrl+Shift+O` | Open CPHub dashboard (extension) |
| `Ctrl+Enter` | Run grader (web editor) |

## Troubleshooting

| Masalah | Solusi |
|---------|--------|
| Grader error | Cek Status page — pastikan firejail terinstall |
| Sync gagal | Cek extension connection di popup Status tab |
| Problem tidak muncul | Refresh Problemset, pastikan extension HMAC key match |
