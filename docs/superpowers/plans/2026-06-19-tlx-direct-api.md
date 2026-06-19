# TLX Direct API Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace extension-based TLX token stealing with direct API calls using the stored token from the user's linked TLX account.

**Architecture:** New JWT-protected `POST /api/problems/import-tlx` endpoint looks up the user's stored TLX token from `linked_accounts`, calls the TLX API server-side, and upserts the problem. Three web UI entry points (problems page, connections page, sidebar) share one `ImportTLXModal` component. Extension `tlx.ts` stripped to a no-op.

**Tech Stack:** Go 1.22 / Fiber v2 / GORM (backend) — Next.js 14 App Router / TypeScript / Tailwind (frontend) — Chrome Extension MV3 (extension)

## Global Constraints

- Module path: `github.com/IDika31/cphub/api`
- TLX API base: `https://api.tlx.toki.id/v2`
- JWT auth middleware: `middleware.AuthRequired(cfg.JWT)` — sets `c.Locals("userId")`
- All frontend styling: inline Tailwind matching existing patterns (dark zinc palette, `#8b5cf6` accent)
- No new dependencies

---

## File Map

| File | Action |
|------|--------|
| `apps/api/internal/handler/tlx_import.go` | **Create** — `TLXImportHandler` + `parseTLXURL` |
| `apps/api/internal/handler/tlx_import_test.go` | **Create** — unit tests for `parseTLXURL` |
| `apps/api/cmd/main.go` | **Modify** — add `TLXImportHandler`, register route |
| `apps/api/internal/handler/account.go` | **Modify** — remove global Redis `"tlx:token"` cache |
| `apps/api/internal/handler/sync.go` | **Modify** — remove TLX branch + 3 payload fields |
| `apps/web/src/lib/api/tlx.ts` | **Create** — `importTLXProblem()` |
| `apps/web/src/components/tlx/ImportTLXModal.tsx` | **Create** — shared modal component |
| `apps/web/src/app/(app)/problems/page.tsx` | **Modify** — Import TLX button in Topbar |
| `apps/web/src/app/(app)/connections/page.tsx` | **Modify** — inline Import button + description fix |
| `apps/web/src/components/shell/sidebar.tsx` | **Modify** — Import TLX "+" next to TLX submenu entry |
| `apps/extension/src/content/tlx.ts` | **Modify** — strip all sync logic |

---

### Task 1: Backend — `TLXImportHandler`

**Files:**
- Create: `apps/api/internal/handler/tlx_import.go`
- Create: `apps/api/internal/handler/tlx_import_test.go`

**Interfaces:**
- Consumes: `tlx.NewClient()`, `tlxClient.GetProblemSetBySlug(slug, token)`, `tlxClient.GetWorksheet(jid, alias, token)`, `problemRepo.Upsert(problem)`, `model.LinkedAccount`, `model.Problem`
- Produces: `NewTLXImportHandler(db, problemRepo) *TLXImportHandler`, `(*TLXImportHandler).ImportTLX(c *fiber.Ctx) error`, `parseTLXURL(rawURL string) (slug, alias string, err error)`

- [ ] **Step 1: Write failing test for `parseTLXURL`**

```go
// apps/api/internal/handler/tlx_import_test.go
package handler

import "testing"

func TestParseTLXURL(t *testing.T) {
	tests := []struct {
		name      string
		input     string
		wantSlug  string
		wantAlias string
		wantErr   bool
	}{
		{
			name:      "standard URL",
			input:     "https://tlx.toki.id/problems/ioi-2024/day1a",
			wantSlug:  "ioi-2024",
			wantAlias: "day1a",
		},
		{
			name:      "URL with trailing slash",
			input:     "https://tlx.toki.id/problems/ioi-2024/day1a/",
			wantSlug:  "ioi-2024",
			wantAlias: "day1a",
		},
		{
			name:      "URL with query string",
			input:     "https://tlx.toki.id/problems/ioi-2024/day1a?tab=editorial",
			wantSlug:  "ioi-2024",
			wantAlias: "day1a",
		},
		{
			name:    "missing alias",
			input:   "https://tlx.toki.id/problems/ioi-2024",
			wantErr: true,
		},
		{
			name:    "wrong path prefix",
			input:   "https://tlx.toki.id/contest/ioi-2024/day1a",
			wantErr: true,
		},
		{
			name:    "not a TLX URL",
			input:   "https://codeforces.com/contest/2233/problem/A",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			slug, alias, err := parseTLXURL(tt.input)
			if tt.wantErr {
				if err == nil {
					t.Errorf("expected error, got slug=%q alias=%q", slug, alias)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if slug != tt.wantSlug {
				t.Errorf("slug = %q, want %q", slug, tt.wantSlug)
			}
			if alias != tt.wantAlias {
				t.Errorf("alias = %q, want %q", alias, tt.wantAlias)
			}
		})
	}
}
```

- [ ] **Step 2: Run test — expect compile error (function not defined yet)**

```bash
cd apps/api && go test ./internal/handler/ -run TestParseTLXURL -v
```
Expected: `undefined: parseTLXURL`

- [ ] **Step 3: Create `tlx_import.go` with handler + `parseTLXURL`**

```go
// apps/api/internal/handler/tlx_import.go
package handler

import (
	"fmt"
	"log"
	"net/url"
	"strings"

	"github.com/IDika31/cphub/api/internal/model"
	"github.com/IDika31/cphub/api/internal/provider/tlx"
	"github.com/IDika31/cphub/api/internal/repository"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type TLXImportHandler struct {
	db          *gorm.DB
	problemRepo *repository.ProblemRepository
}

func NewTLXImportHandler(db *gorm.DB, problemRepo *repository.ProblemRepository) *TLXImportHandler {
	return &TLXImportHandler{db: db, problemRepo: problemRepo}
}

func (h *TLXImportHandler) ImportTLX(c *fiber.Ctx) error {
	userID := c.Locals("userId").(string)
	uid, _ := uuid.Parse(userID)

	var input struct {
		URL string `json:"url"`
	}
	if err := c.BodyParser(&input); err != nil || input.URL == "" {
		return c.Status(400).JSON(fiber.Map{"error": "URL TLX wajib diisi"})
	}

	slug, alias, err := parseTLXURL(input.URL)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "URL TLX tidak valid — format: https://tlx.toki.id/problems/{slug}/{alias}"})
	}

	var account model.LinkedAccount
	if err := h.db.Where("user_id = ? AND provider = ?", uid, "tlx").First(&account).Error; err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Akun TLX belum dihubungkan — hubungkan di halaman Connections"})
	}

	tlxClient := tlx.NewClient()

	ps, err := tlxClient.GetProblemSetBySlug(slug, account.AccessToken)
	if err != nil {
		log.Printf("[tlx-import] GetProblemSetBySlug failed (%s): %v", slug, err)
		if strings.Contains(err.Error(), "HTTP 401") || strings.Contains(err.Error(), "HTTP 403") {
			return c.Status(502).JSON(fiber.Map{"error": "Token TLX kedaluwarsa — hubungkan ulang akun di Connections"})
		}
		return c.Status(502).JSON(fiber.Map{"error": "Gagal mengambil data problemset TLX: " + err.Error()})
	}

	ws, err := tlxClient.GetWorksheet(ps.JID, alias, account.AccessToken)
	if err != nil {
		log.Printf("[tlx-import] GetWorksheet failed (%s/%s): %v", ps.JID, alias, err)
		if strings.Contains(err.Error(), "HTTP 404") {
			return c.Status(404).JSON(fiber.Map{"error": "Problem tidak ditemukan di TLX"})
		}
		if strings.Contains(err.Error(), "HTTP 401") || strings.Contains(err.Error(), "HTTP 403") {
			return c.Status(502).JSON(fiber.Map{"error": "Token TLX kedaluwarsa — hubungkan ulang akun di Connections"})
		}
		return c.Status(502).JSON(fiber.Map{"error": "Gagal mengambil worksheet TLX: " + err.Error()})
	}

	problemID := slug + "-" + alias
	problem := &model.Problem{
		Provider:     "tlx",
		ProblemID:    problemID,
		Title:        ws.Title,
		Statement:    ws.Statement,
		TimeLimit:    ws.TimeLimit(),
		MemoryLimit:  ws.MemoryLimit(),
		Tags:         "[]",
		URL:          fmt.Sprintf("https://tlx.toki.id/problems/%s/%s", slug, alias),
		Status:       "synced",
		ProblemGroup: ps.Name,
	}
	problem.ID = uuid.New()

	if err := h.problemRepo.Upsert(problem); err != nil {
		log.Printf("[tlx-import] upsert failed: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "Gagal menyimpan problem"})
	}

	log.Printf("[tlx-import] imported: %s — %q (user=%s)", problemID, ws.Title, userID)
	return c.JSON(fiber.Map{
		"problemId": problemID,
		"title":     ws.Title,
		"provider":  "tlx",
	})
}

// parseTLXURL extracts slug and alias from a TLX problem URL.
// Expected: https://tlx.toki.id/problems/{slug}/{alias}
func parseTLXURL(rawURL string) (slug, alias string, err error) {
	u, err := url.Parse(rawURL)
	if err != nil {
		return "", "", fmt.Errorf("invalid URL: %w", err)
	}
	parts := strings.Split(strings.Trim(u.Path, "/"), "/")
	if len(parts) < 3 || parts[0] != "problems" || parts[1] == "" || parts[2] == "" {
		return "", "", fmt.Errorf("expected /problems/{slug}/{alias}, got %q", u.Path)
	}
	return parts[1], parts[2], nil
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
cd apps/api && go test ./internal/handler/ -run TestParseTLXURL -v
```
Expected: `PASS`

- [ ] **Step 5: Register route in `cmd/main.go`**

In `main()`, after `problemRepo := repository.NewProblemRepository(db)`:
```go
tlxImportHandler := handler.NewTLXImportHandler(db, problemRepo)
```

Add parameter to `registerRoutes` call:
```go
registerRoutes(app, authHandler, graderHandler, syncHandler, problemHandler, submissionHandler, dashboardHandler, accountHandler, settingsHandler, snippetHandler, tlxImportHandler, cfg)
```

Update `registerRoutes` signature (add after `snippetHandler *handler.SnippetHandler`):
```go
tlxImportHandler *handler.TLXImportHandler,
```

Inside `registerRoutes`, add after `problems.Get("/by-provider/:provider/:problemId", problemHandler.GetByProviderAndID)`:
```go
problems.Post("/import-tlx", tlxImportHandler.ImportTLX)
```

- [ ] **Step 6: Verify build**

```bash
cd apps/api && go build ./...
```
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add apps/api/internal/handler/tlx_import.go apps/api/internal/handler/tlx_import_test.go apps/api/cmd/main.go
git commit -m "feat(api): add TLXImportHandler with direct API token lookup"
```

---

### Task 2: Backend — Cleanup account.go and sync.go

**Files:**
- Modify: `apps/api/internal/handler/account.go`
- Modify: `apps/api/internal/handler/sync.go`

**Interfaces:**
- Consumes: nothing new
- Produces: `SyncProblemPayload` without `TLXToken`, `TLXAlias`, `ContestID` fields

- [ ] **Step 1: Remove Redis global token cache from `account.go`**

In `LinkTLX`, remove these two lines (the comment and the call):
```go
// Cache token in Redis so sync handler can use it (7 days TTL)
database.Cache.Set(c.Context(), "tlx:token", loginResult.Token, 7*24*time.Hour)
```

- [ ] **Step 2: Remove TLX branch from `sync.go`**

Remove from `SyncProblemPayload` struct (lines with `TLXToken`, `TLXAlias`, `ContestID`):
```go
	// TLX-specific: token + alias so backend can fetch from TLX API
	TLXToken string `json:"tlxToken"`
	TLXAlias string `json:"tlxAlias"`
	ContestID string `json:"contestId"`
```

Remove the entire TLX branch in `SyncProblem` (the `if payload.Provider == "tlx" ...` block):
```go
	// For TLX: fetch problem data server-side using the token
	if payload.Provider == "tlx" && payload.TLXAlias != "" && payload.ContestID != "" {
		token := payload.TLXToken
		// Fallback: use token cached from Connect TLX flow
		if token == "" {
			token, _ = database.Cache.Get(c.Context(), "tlx:token").Result()
		}
		if token == "" {
			return c.Status(400).JSON(fiber.Map{"error": "TLX belum terhubung — hubungkan akun di halaman Connections"})
		}

		tlxClient := tlx.NewClient()
		ps, err := tlxClient.GetProblemSetBySlug(payload.ContestID, token)
		if err != nil {
			log.Printf("[sync] TLX problemset fetch failed (%s): %v", payload.ContestID, err)
			return c.Status(502).JSON(fiber.Map{"error": "Gagal mengambil data problemset TLX: " + err.Error()})
		}
		ws, err := tlxClient.GetWorksheet(ps.JID, payload.TLXAlias, token)
		if err != nil {
			log.Printf("[sync] TLX worksheet fetch failed (%s/%s): %v", ps.JID, payload.TLXAlias, err)
			return c.Status(502).JSON(fiber.Map{"error": "Gagal mengambil worksheet TLX: " + err.Error()})
		}
		payload.Title = ws.Title
		payload.Statement = ws.Statement
		payload.TimeLimit = ws.TimeLimit()
		payload.MemoryLimit = ws.MemoryLimit()
		payload.ProblemGroup = ps.Name
		log.Printf("[sync] TLX problem fetched server-side: %s/%s — %q", payload.ContestID, payload.TLXAlias, ws.Title)
	}
```

Remove unused imports from `sync.go` — check if `tlx` and `database` packages are still used. If the `tlx` import is now unused, remove it. If `database` is used only for the TLX Redis lookup and nonce checks in middleware (middleware is separate), check if any other usage remains in sync.go.

- [ ] **Step 3: Verify build**

```bash
cd apps/api && go build ./...
```
Expected: no errors. If unused import error, remove the flagged import.

- [ ] **Step 4: Commit**

```bash
git add apps/api/internal/handler/account.go apps/api/internal/handler/sync.go
git commit -m "refactor(api): remove TLX token from extension sync, drop global Redis key"
```

---

### Task 3: Frontend — API client + Modal component

**Files:**
- Create: `apps/web/src/lib/api/tlx.ts`
- Create: `apps/web/src/components/tlx/ImportTLXModal.tsx`

**Interfaces:**
- Consumes: `apiClient` from `@/lib/api/client`, `Modal` from `@/components/ui/modal`, `Button` from `@/components/ui/button`
- Produces: `importTLXProblem(url: string): Promise<ImportTLXResult>`, `ImportTLXModal({ open, onClose, onSuccess })` component

- [ ] **Step 1: Create `apps/web/src/lib/api/tlx.ts`**

```ts
import { apiClient } from "./client";

export interface ImportTLXResult {
  problemId: string;
  title: string;
  provider: string;
}

export async function importTLXProblem(url: string): Promise<ImportTLXResult> {
  return apiClient("/api/problems/import-tlx", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}
```

- [ ] **Step 2: Create `apps/web/src/components/tlx/` directory and `ImportTLXModal.tsx`**

```bash
mkdir -p "apps/web/src/components/tlx"
```

```tsx
// apps/web/src/components/tlx/ImportTLXModal.tsx
"use client";
import { useState } from "react";
import Modal from "@/components/ui/modal";
import Button from "@/components/ui/button";
import { importTLXProblem } from "@/lib/api/tlx";

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess?: (problemId: string) => void;
}

export default function ImportTLXModal({ open, onClose, onSuccess }: Props) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function handleClose() {
    onClose();
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await importTLXProblem(url);
      setUrl("");
      handleClose();
      onSuccess?.(res.problemId);
    } catch (err: unknown) {
      setError(
        (err as { message?: string })?.message || "Gagal mengimport problem TLX",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Import Problem TLX">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-[13px] text-[#71717a]">
          Paste URL problem TLX — contoh:{" "}
          <span className="text-[#a1a1aa]">
            https://tlx.toki.id/problems/ioi-2024/day1a
          </span>
        </p>
        <div className="space-y-2">
          <label className="block text-[12px] text-[#a1a1aa]">URL Problem</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://tlx.toki.id/problems/..."
            required
            className="w-full bg-[#09090b] border border-[rgba(255,255,255,0.08)] rounded-[6px] px-3 py-2 text-[13px] text-[#e4e4e7] placeholder-[#52525b] focus:outline-none focus:border-[#8b5cf6]"
          />
        </div>
        {error && <p className="text-[12px] text-[#ef4444]">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={handleClose}>
            Batal
          </Button>
          <Button type="submit" variant="primary" disabled={loading}>
            {loading ? "Mengimport..." : "Import"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep -E "tlx|ImportTLX" | head -20
```
Expected: no errors for the new files.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/api/tlx.ts apps/web/src/components/tlx/ImportTLXModal.tsx
git commit -m "feat(web): add importTLXProblem API + ImportTLXModal component"
```

---

### Task 4: Frontend — Wire ImportTLXModal into 3 UI entry points

**Files:**
- Modify: `apps/web/src/app/(app)/problems/page.tsx`
- Modify: `apps/web/src/app/(app)/connections/page.tsx`
- Modify: `apps/web/src/components/shell/sidebar.tsx`

**Interfaces:**
- Consumes: `ImportTLXModal` from `@/components/tlx/ImportTLXModal`, `importTLXProblem` (indirect via modal)
- Produces: Three UI entry points each opening `ImportTLXModal`

#### A — Problems page

- [ ] **Step 1: Modify `apps/web/src/app/(app)/problems/page.tsx`**

Add imports at top:
```tsx
import ImportTLXModal from "@/components/tlx/ImportTLXModal";
```

Inside `ProblemsetContent`, add state:
```tsx
const [importModalOpen, setImportModalOpen] = useState(false);
```

Replace the `<Topbar title="Problemset">` block with:
```tsx
<Topbar title="Problemset">
  <div className="flex items-center gap-2">
    <div className="relative">
      <Search className="absolute left-[8px] top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#52525b]" />
      <input
        className="w-[200px] h-[30px] pl-[28px] pr-[10px] rounded-[6px] text-[12px] bg-[#1f1f23] border border-[rgba(255,255,255,0.08)] text-[#e4e4e7] focus:outline-none focus:border-[#8b5cf6] transition-colors"
        placeholder="Search problems..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
    </div>
    <Button variant="primary" onClick={() => setImportModalOpen(true)}>
      Import TLX
    </Button>
  </div>
</Topbar>
<ImportTLXModal
  open={importModalOpen}
  onClose={() => setImportModalOpen(false)}
  onSuccess={(id) => router.push(`/problems/${id}`)}
/>
```

Update `EmptyState` description (remove extension reference):
```tsx
description="Sync problems dari Codeforces via extension, atau import TLX problem via tombol Import TLX."
```

#### B — Connections page

- [ ] **Step 2: Modify `apps/web/src/app/(app)/connections/page.tsx`**

Add import:
```tsx
import ImportTLXModal from "@/components/tlx/ImportTLXModal";
```

Add state (after existing `tlxError` state):
```tsx
const [tlxImportOpen, setTlxImportOpen] = useState(false);
```

Fix the TLX description in `setProviders` call — change:
```tsx
description: "Hubungkan akun TLX via browser extension untuk mulai sync problem.",
```
to:
```tsx
description: "Hubungkan akun TLX untuk import problem langsung via API.",
```

In the providers map, replace the buttons for TLX connected state. The existing pattern is:
```tsx
{p.connected && p.account ? (
  <Button variant="danger" onClick={() => handleUnlink(p.account!.id)}>
    Unlink
  </Button>
) : (
  <Button variant="primary" onClick={() => handleLink(p.provider)}>
    Link
  </Button>
)}
```

Replace with:
```tsx
{p.connected && p.account ? (
  <div className="flex items-center gap-2">
    {p.provider === "tlx" && (
      <Button variant="ghost" onClick={() => setTlxImportOpen(true)}>
        Import Problem
      </Button>
    )}
    <Button variant="danger" onClick={() => handleUnlink(p.account!.id)}>
      Unlink
    </Button>
  </div>
) : (
  <Button variant="primary" onClick={() => handleLink(p.provider)}>
    Link
  </Button>
)}
```

Add modal before the closing `</>` of the return:
```tsx
<ImportTLXModal
  open={tlxImportOpen}
  onClose={() => setTlxImportOpen(false)}
/>
```

#### C — Sidebar (global entry point)

- [ ] **Step 3: Modify `apps/web/src/components/shell/sidebar.tsx`**

Add imports:
```tsx
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import ImportTLXModal from "@/components/tlx/ImportTLXModal";
```

Inside `SidebarInner`, add:
```tsx
const router = useRouter();
const [importTLXOpen, setImportTLXOpen] = useState(false);
const tlxLinked = providers.some((p) => p.provider === "tlx");
```

In the submenu section (inside `{item.hasSubmenu && isExpanded && ...}`), after the provider links, add a conditional "Import TLX" button when TLX is linked. Replace the existing provider links block:

```tsx
{providers.map((p) => (
  <div key={p.provider} className="flex items-center group">
    <Link
      href={`${item.href}?provider=${p.provider}`}
      className={`flex-1 block px-[10px] py-[5px] rounded-[6px] text-[12px] transition-colors ${
        pathname.startsWith(item.href) && providerParam === p.provider
          ? "text-[#8b5cf6]"
          : "text-[#71717a] hover:text-[#e4e4e7]"
      }`}
    >
      {p.provider === "codeforces"
        ? "Codeforces"
        : p.provider === "tlx"
          ? "TLX TOKI"
          : p.provider}
    </Link>
    {p.provider === "tlx" && (
      <button
        onClick={() => setImportTLXOpen(true)}
        title="Import TLX Problem"
        className="opacity-0 group-hover:opacity-100 p-[3px] rounded text-[#52525b] hover:text-[#8b5cf6] transition-all"
      >
        <Plus className="w-3 h-3" />
      </button>
    )}
  </div>
))}
```

Add modal before closing `</aside>`:
```tsx
<ImportTLXModal
  open={importTLXOpen}
  onClose={() => setImportTLXOpen(false)}
  onSuccess={(id) => router.push(`/problems/${id}`)}
/>
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/\(app\)/problems/page.tsx \
        apps/web/src/app/\(app\)/connections/page.tsx \
        apps/web/src/components/shell/sidebar.tsx
git commit -m "feat(web): add Import TLX entry points in problems page, connections page, and sidebar"
```

---

### Task 5: Extension — Strip TLX sync

**Files:**
- Modify: `apps/extension/src/content/tlx.ts`

**Interfaces:**
- Produces: file remains as content script (loaded by manifest) but performs no sync

- [ ] **Step 1: Replace entire `tlx.ts` content**

```ts
// apps/extension/src/content/tlx.ts
import { logger } from "../shared/logger";

logger.info("TLX content script loaded");
```

- [ ] **Step 2: Verify extension builds**

```bash
cd apps/extension && npm run build 2>&1 | tail -20
```
Expected: build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/extension/src/content/tlx.ts
git commit -m "refactor(ext): strip TLX sync — TLX import now via web app direct API"
```

---

## Manual Verification Checklist

After all tasks are complete:

- [ ] Start API: `cd apps/api && go run ./cmd/main.go`
- [ ] Start web: `cd apps/web && npm run dev`
- [ ] Log in to CPHub, go to Connections, link a TLX account with valid credentials
- [ ] Paste a TLX problem URL into the Import modal (via Problems page, Connections page, or sidebar "+")
- [ ] Verify problem appears in the Problems list with correct title, time limit, memory limit
- [ ] Verify clicking the problem opens the editor with the TLX problem statement
- [ ] Open browser console on the TLX website — verify extension no longer logs token-related activity
- [ ] With TLX NOT linked, open Import modal and paste a URL — verify error "Akun TLX belum dihubungkan"
- [ ] With invalid URL (e.g. `https://codeforces.com/contest/2233/problem/A`) — verify error "URL TLX tidak valid"
