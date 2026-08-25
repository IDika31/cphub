# CPHub V4 — API Documentation

## Base URL

```
http://localhost:3001/api
```

## Authentication

### Register
```
POST /api/auth/register
Body: { "name": "...", "email": "...", "password": "..." }
Response 201: { "user": {...}, "accessToken": "...", "refreshToken": "..." }
```

### Login
```
POST /api/auth/login
Body: { "email": "...", "password": "..." }
Response 200: { "user": {...}, "accessToken": "...", "refreshToken": "..." }
```

### Google OAuth
```
GET /api/auth/google
Redirect to Google OAuth consent screen
GET /api/auth/google/callback?code=...
Response 200: { "user": {...}, "accessToken": "...", "refreshToken": "..." }
```

### Me
```
GET /api/auth/me
Header: Authorization: Bearer <token>
Response 200: { "userId": "...", "email": "..." }
```

---

## Problems

### List
```
GET /api/problems?page=1&limit=50&provider=codeforces&tag=dp&difficulty=800&status=solved
Response 200: { "data": [...], "total": 0, "page": 1, "limit": 50 }
```

### Detail
```
GET /api/problems/:id
Response 200: { "id": "...", "title": "...", "statement": "...", ... }
```

### Search
```
GET /api/problems/search?q=watermelon
Response 200: { "data": [...], "total": 0 }
```

---

## Sync (HMAC Auth, per account)

Each account has its own extension secret. Get the pairing token
(`<accountId>.<secret>`) from `GET /api/auth/hmac-secret`, or mint a new one with
`POST /api/auth/hmac-secret/rotate` (both JWT protected).

The signature is `hex(HMAC-SHA256(secret, raw request body))`.

### Sync Problem
```
POST /api/sync/problem
Header: X-Key-Id: <account uuid>
Header: X-HMAC-Signature: <sha256-hmac of the body>
Header: X-Nonce: <unique-nonce>
Body: { "provider": "codeforces", "problemId": "4A", "title": "...", ... }
Response 200: { "status": "ok", "message": "Problem synced" }
```

### Sync Submission
```
POST /api/sync/submission
Body: { "provider": "codeforces", "submissionId": "123", "verdict": "Accepted", ... }
```

---

## Grader (JWT Auth)

### Run
```
POST /api/grader/run
Header: Authorization: Bearer <token>
Body: {
  "language": "cpp17",
  "sourceCode": "#include <bits/stdc++.h>...",
  "testCases": [{ "input": "1 2", "output": "3" }]
}
Response 200: {
  "verdict": "AC",
  "totalTests": 1,
  "passedTests": 1,
  "maxRuntime": 15,
  "results": [{ "index": 0, "verdict": "AC", "runtime": 15, ... }]
}
```

### Status
```
GET /api/grader/status
Response 200: { "component": "grader", "queue": {"active":0,"max":5}, "compilers": {...}, "firejail": true }
```

### WebSocket
```
ws://localhost:3001/api/grader/ws
```

---

## Submissions (JWT)

### Local
```
GET /api/submissions/local?page=1&limit=50
Response 200: { "data": [...], "total": 0 }
```

### External
```
GET /api/submissions/external?provider=codeforces&page=1&limit=50
Response 200: { "data": [...], "total": 0 }
```

---

## Dashboard (JWT)

### Overview
```
GET /api/dashboard/overview
Response 200: { "solved": 0, "attempted": 0, "streak": 0, "accuracy": 0 }
```

### Rating
```
GET /api/dashboard/rating
Response 200: { "data": [] }
```

### Heatmap
```
GET /api/dashboard/heatmap
Response 200: { "data": [] }
```

### Tag Weakness
```
GET /api/dashboard/tag-weakness
Response 200: { "data": [] }
```

---

## Health

```
GET /api/health
Response 200: { "overall": "ok", "database": {"status":"ok"}, "cache": {"status":"ok"}, "grader": {"status":"ok"} }
```

## Error Codes

| Code | HTTP | Arti |
|------|------|------|
| `GRADER_COMPILER_UNAVAILABLE` | 503 | Kompiler tidak ditemukan |
| `GRADER_SANDBOX_UNAVAILABLE` | 503 | firejail tidak terinstall |
| `GRADER_CODE_TOO_LARGE` | 413 | Kode > 256 KB |
| `GRADER_TEMP_DIR_FAILED` | 500 | Gagal buat temp dir |
| `GRADER_QUEUE_FULL` | 429 | Antrian grader penuh |
