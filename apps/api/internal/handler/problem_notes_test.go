package handler

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http/httptest"
	"testing"

	"github.com/IDika31/cphub/api/internal/model"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// setupNotesDB is the recommender's fixture plus the notes table, since a note is stored
// against a problem row and the handler resolves the provider's ref through it.
func setupNotesDB(t *testing.T) *gorm.DB {
	t.Helper()
	db := setupRecommendDB(t)
	if err := db.Exec(`CREATE TABLE problem_notes (
		id TEXT PRIMARY KEY, user_id TEXT NOT NULL, problem_id TEXT NOT NULL,
		body TEXT NOT NULL DEFAULT '', created_at DATETIME, updated_at DATETIME,
		UNIQUE (user_id, problem_id)
	)`).Error; err != nil {
		t.Fatalf("create problem_notes: %v", err)
	}
	return db
}

// noteRequest drives the handler through a real request, because the viewer comes from
// c.Locals and the problem key from the route parameter.
func noteRequest(t *testing.T, db *gorm.DB, uid uuid.UUID, method, key, body string) (int, map[string]any) {
	t.Helper()
	h := NewProblemNotesHandler(db)
	app := fiber.New()
	app.Get("/p/:id/note", func(c *fiber.Ctx) error {
		c.Locals("userId", uid.String())
		return h.GetNote(c)
	})
	app.Put("/p/:id/note", func(c *fiber.Ctx) error {
		c.Locals("userId", uid.String())
		return h.SaveNote(c)
	})

	req := httptest.NewRequest(method, "/p/"+key+"/note", bytes.NewReader([]byte(body)))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	raw, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	var out map[string]any
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &out); err != nil {
			t.Fatalf("bad JSON %s", raw)
		}
	}
	return resp.StatusCode, out
}

// Nothing written yet is the normal case — the editor opens on every problem — so it is an
// empty note and not a 404 the page has to special-case.
func TestGetNoteIsEmptyBeforeAnythingIsWritten(t *testing.T) {
	db := setupNotesDB(t)
	id := seedCandidate(t, db, "4A", 800, `["math"]`)

	status, out := noteRequest(t, db, uuid.New(), fiber.MethodGet, id.String(), "")
	if status != 200 {
		t.Fatalf("status = %d, want 200", status)
	}
	if out["body"] != "" || out["updatedAt"] != nil {
		t.Errorf("out = %v, want an empty note", out)
	}
}

// The second save of a note overwrites the first rather than adding a row: one note per
// problem per user is what the unique index says, and what the editor assumes.
func TestSaveNoteUpsertsAndIsReadBack(t *testing.T) {
	db := setupNotesDB(t)
	id := seedCandidate(t, db, "4A", 800, `["math"]`)
	me := uuid.New()

	if status, _ := noteRequest(t, db, me, fiber.MethodPut, id.String(), `{"body":"lupa long long"}`); status != 200 {
		t.Fatalf("first save: status = %d", status)
	}
	if status, _ := noteRequest(t, db, me, fiber.MethodPut, id.String(), `{"body":"lupa long long, n sampai 2e5"}`); status != 200 {
		t.Fatalf("second save: status = %d", status)
	}

	var count int64
	db.Model(&model.ProblemNote{}).Where("user_id = ?", me).Count(&count)
	if count != 1 {
		t.Errorf("%d notes stored, want 1", count)
	}
	_, out := noteRequest(t, db, me, fiber.MethodGet, id.String(), "")
	if out["body"] != "lupa long long, n sampai 2e5" {
		t.Errorf("body = %v, want the second version", out["body"])
	}
	if out["updatedAt"] == nil {
		t.Error("updatedAt missing — the panel prints when it last saved")
	}
}

// Clearing the textarea deletes the note. Storing a blank row instead would leave
// "everything I have written down" full of problems where nothing was written.
func TestSaveEmptyNoteDeletesIt(t *testing.T) {
	db := setupNotesDB(t)
	id := seedCandidate(t, db, "4A", 800, `["math"]`)
	me := uuid.New()

	noteRequest(t, db, me, fiber.MethodPut, id.String(), `{"body":"sesuatu"}`)
	noteRequest(t, db, me, fiber.MethodPut, id.String(), `{"body":"   "}`)

	var count int64
	db.Model(&model.ProblemNote{}).Where("user_id = ?", me).Count(&count)
	if count != 0 {
		t.Errorf("%d notes left, want none", count)
	}
}

// A note belongs to one reader. The library is shared; this is the one thing on the page
// that is not.
func TestNotesAreNotSharedBetweenUsers(t *testing.T) {
	db := setupNotesDB(t)
	id := seedCandidate(t, db, "4A", 800, `["math"]`)
	me, other := uuid.New(), uuid.New()

	noteRequest(t, db, me, fiber.MethodPut, id.String(), `{"body":"punyaku"}`)

	if _, out := noteRequest(t, db, other, fiber.MethodGet, id.String(), ""); out["body"] != "" {
		t.Errorf("another user read %v, want an empty note", out["body"])
	}
}

// The page knows the provider's ref when the user arrived from a deep link and the UUID
// when they came from the Problemset, so both have to resolve to the same note.
func TestNoteAcceptsTheProviderRef(t *testing.T) {
	db := setupNotesDB(t)
	seedCandidate(t, db, "4A", 800, `["math"]`)
	me := uuid.New()

	if status, _ := noteRequest(t, db, me, fiber.MethodPut, "4A", `{"body":"via ref"}`); status != 200 {
		t.Fatalf("save by ref: status = %d", status)
	}
	if _, out := noteRequest(t, db, me, fiber.MethodGet, "4A", ""); out["body"] != "via ref" {
		t.Errorf("body = %v", out["body"])
	}
	if status, _ := noteRequest(t, db, me, fiber.MethodGet, "9999Z", ""); status != 404 {
		t.Errorf("unknown problem: status = %d, want 404", status)
	}
}
