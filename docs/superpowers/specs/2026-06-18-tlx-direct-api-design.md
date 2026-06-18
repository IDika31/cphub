# TLX Direct API Integration — Design Spec

**Date:** 2026-06-18  
**Status:** Approved

## Problem

TLX problem sync currently depends on the browser extension:

1. Extension reads TLX token from browser `localStorage("persist:session")` — fragile, requires user to be logged into TLX in browser separately
2. Backend stores TLX token in Redis under global key `"tlx:token"` — single key breaks with multiple users
3. HMAC sync endpoint has no user identity — can't look up per-user stored token from DB
4. Users must have extension installed and active to sync any TLX problem

## Goal

TLX problem import works entirely from the web app, using the token stored when user links their TLX account via the Connections page. Extension not required for TLX.

## Architecture

### Backend

**New endpoint: `POST /api/problems/import-tlx`**

- Auth: JWT (`middleware.AuthRequired`)
- Request body: `{ "url": "https://tlx.toki.id/problems/{slug}/{alias}" }`
- Handler: new `TLXImportHandler` in `handler/tlx_import.go` — needs both `db *gorm.DB` (for `LinkedAccount` lookup) and `problemRepo *repository.ProblemRepository` (for upsert). `ProblemHandler` not modified.
  1. Parse `slug` and `alias` from URL path
  2. Validate: both fields non-empty
  3. Lookup `LinkedAccount` where `user_id = userId AND provider = "tlx"`
  4. Return 400 `"Akun TLX belum dihubungkan"` if not found
  5. Use `account.AccessToken` as TLX token
  6. Call `tlxClient.GetProblemSetBySlug(slug, token)` → JID + name
  7. Call `tlxClient.GetWorksheet(jid, alias, token)` → title, statement, limits
  8. Build `model.Problem` with `ProblemID = "{slug}-{alias}"`, `Provider = "tlx"`
  9. Upsert via `problemRepo.Upsert(problem)`
  10. Return `{ problemId, title, provider }`

**Route registration in `cmd/main.go`:**
```
problems.Post("/import-tlx", problemHandler.ImportTLX)
```

**Cleanup `account.go` `LinkTLX`:**
- Remove `database.Cache.Set(c.Context(), "tlx:token", ...)` — Redis global key not needed

**Cleanup `sync.go` `SyncProblem`:**
- Remove TLX branch (lines 63–90): `payload.TLXToken`, `payload.TLXAlias`, `payload.ContestID` handling
- Remove `TLXToken`, `TLXAlias`, `ContestID` fields from `SyncProblemPayload`

### Web Frontend

**New shared component: `ImportTLXModal`**

Location: `apps/web/src/components/tlx/ImportTLXModal.tsx`

Props:
```ts
interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess?: (problemId: string) => void;
}
```

Behavior:
- Input field for TLX problem URL
- Submit → calls `POST /api/problems/import-tlx`
- Loading state on submit button
- Error display inline
- On success: toast notification + call `onSuccess` (problems page redirects to new problem)

**New API function: `apps/web/src/lib/api/tlx.ts`**
```ts
export async function importTLXProblem(url: string): Promise<{ problemId: string; title: string }>
```

**Three UI entry points (all use `ImportTLXModal`):**

1. **Problems page** (`/problems`): "Import TLX" button in page header, visible only when TLX is linked. On success: `router.push(/problems/${problemId})`.

2. **Connections page** (`/connections`): After TLX row shows "Connected", render a compact "Import Problem" row with URL input. Inline success feedback (no redirect).

3. **Topbar** (`components/shell/topbar.tsx`): "Import" icon button visible globally. Opens same modal. On success: `router.push(/problems/${problemId})`.

Topbar passes `onSuccess` prop down or uses `useRouter` internally.

### Extension Cleanup

**`apps/extension/src/content/tlx.ts`** — strip all sync logic, keep detection only:

Remove:
- `getTLXToken()` function
- `buildPayload()` function  
- `sendSync()` function
- `tryAutoSync()` function + call
- `observeNavigation(tryAutoSync)` call
- `chrome.runtime.onMessage` listener for `SYNC_PROBLEM`
- Import of `observeNavigation` from detector

Keep:
- File exists (content script still loaded for page detection)
- `logger.info("TLX content script loaded")`
- Import of `detectPageType` if needed by other code; otherwise remove

Result: Extension still enables Alt+C to open CPHub editor on TLX pages (handled by `background/index.ts`), but does not sync or read TLX tokens.

## Data Flow (After Fix)

```
User links TLX → POST /api/accounts/tlx → Go backend → TLX API login
                                         → store token in linked_accounts.access_token

User imports TLX problem (web) → POST /api/problems/import-tlx (JWT)
                               → lookup linked_accounts.access_token
                               → TLX API: GetProblemSetBySlug + GetWorksheet
                               → upsert problem
                               → return problemId
```

## Error Cases

| Condition | Response |
|-----------|----------|
| TLX not linked | 400 "Akun TLX belum dihubungkan" |
| Invalid URL (can't parse slug/alias) | 400 "URL TLX tidak valid" |
| TLX API returns 401 (token expired) | 502 "Token TLX kedaluwarsa — hubungkan ulang akun di Connections" |
| TLX API returns 404 (problem not found) | 404 "Problem tidak ditemukan di TLX" |
| DB upsert fails | 500 |

## Files Changed

| File | Change |
|------|--------|
| `apps/api/internal/handler/tlx_import.go` | New `TLXImportHandler` with `ImportTLX` method |
| `apps/api/cmd/main.go` | Instantiate `TLXImportHandler`, register `problems.Post("/import-tlx", ...)` |
| `apps/api/internal/handler/account.go` | Remove Redis `"tlx:token"` cache set |
| `apps/api/internal/handler/sync.go` | Remove TLX branch + fields from payload struct |
| `apps/web/src/components/tlx/ImportTLXModal.tsx` | New component |
| `apps/web/src/lib/api/tlx.ts` | New API function |
| `apps/web/src/app/(app)/problems/page.tsx` | Add Import TLX button |
| `apps/web/src/app/(app)/connections/page.tsx` | Add inline import form after TLX linked |
| `apps/web/src/components/shell/topbar.tsx` | Add Import icon button |
| `apps/extension/src/content/tlx.ts` | Strip sync logic, keep detection only |
