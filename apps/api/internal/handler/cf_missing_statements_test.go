package handler

import (
	"encoding/json"
	"io"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// seedProblemWithStatement is the recommender fixture's seeder plus a statement, so a test
// can tell "waiting for prose" apart from "already has it".
func seedProblemWithStatement(t *testing.T, db *gorm.DB, ref string, difficulty int, tags, statement string) {
	t.Helper()
	err := db.Exec(
		`INSERT INTO problems (id, provider, problem_id, title, statement, difficulty, tags, materials, url, created_at)
		 VALUES (?, 'codeforces', ?, ?, ?, ?, ?, '[]', '', CURRENT_TIMESTAMP)`,
		uuid.New().String(), ref, "problem "+ref, statement, difficulty, tags,
	).Error
	if err != nil {
		t.Fatalf("seed problem %s: %v", ref, err)
	}
}

func missingStatements(t *testing.T, db *gorm.DB, query string) map[string]any {
	t.Helper()
	h := &CFSyncHandler{db: db}
	app := fiber.New()
	app.Get("/m", h.MissingStatements)

	target := "/m"
	if query != "" {
		target += "?" + query
	}
	resp, err := app.Test(httptest.NewRequest(fiber.MethodGet, target, nil))
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	raw, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	var out map[string]any
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("bad JSON %s", raw)
	}
	return out
}

func pendingRefs(t *testing.T, out map[string]any) []string {
	t.Helper()
	rows, _ := out["data"].([]any)
	refs := make([]string, 0, len(rows))
	for _, r := range rows {
		m, ok := r.(map[string]any)
		if !ok {
			t.Fatalf("unexpected row: %#v", r)
		}
		refs = append(refs, m["problemId"].(string))
	}
	return refs
}

// The list is the problems the editor cannot render yet: synced from the API, which carries
// no statements, and not yet visited by anyone.
func TestMissingStatementsListsOnlyEmptyOnes(t *testing.T) {
	db := setupRecommendDB(t)
	seedProblemWithStatement(t, db, "1A", 800, `["dp"]`, "")
	seedProblemWithStatement(t, db, "1B", 800, `["dp"]`, "<p>ada isinya</p>")

	out := missingStatements(t, db, "")
	if got := pendingRefs(t, out); len(got) != 1 || got[0] != "1A" {
		t.Errorf("pending = %v, want only 1A", got)
	}
	if out["remaining"] != float64(1) {
		t.Errorf("remaining = %v, want 1", out["remaining"])
	}
}

// Codeforces ANDs the tags on its own problemset page, and so does this: "dp,trees" means
// both tags, not either. The quote-anchored match is what keeps "dp" out of "dp on trees".
func TestMissingStatementsAndsTheTags(t *testing.T) {
	db := setupRecommendDB(t)
	seedProblemWithStatement(t, db, "2A", 1500, `["dp","trees"]`, "")
	seedProblemWithStatement(t, db, "2B", 1500, `["dp"]`, "")
	seedProblemWithStatement(t, db, "2C", 1500, `["trees"]`, "")

	if got := pendingRefs(t, missingStatements(t, db, "tags=dp,trees")); len(got) != 1 || got[0] != "2A" {
		t.Errorf("pending = %v, want only the problem carrying both tags", got)
	}
	// A trailing comma is a typo, not a condition nothing can satisfy.
	if got := pendingRefs(t, missingStatements(t, db, "tags=dp,")); len(got) != 2 {
		t.Errorf("pending for a trailing comma = %v, want both dp problems", got)
	}
}

func TestMissingStatementsRespectsTheRatingRange(t *testing.T) {
	db := setupRecommendDB(t)
	seedProblemWithStatement(t, db, "3A", 1200, `["dp"]`, "")
	seedProblemWithStatement(t, db, "3B", 1600, `["dp"]`, "")
	seedProblemWithStatement(t, db, "3C", 2000, `["dp"]`, "")

	got := pendingRefs(t, missingStatements(t, db, "minRating=1400&maxRating=1800"))
	if len(got) != 1 || got[0] != "3B" {
		t.Errorf("pending = %v, want only the 1600 problem", got)
	}
}

// The batch is handed out over minutes, so the order has to be stable — an unstable one
// would hand the same problem out twice while skipping another — and capped, because each
// entry costs a real page load in the user's browser.
func TestMissingStatementsIsCappedAndOrdered(t *testing.T) {
	db := setupRecommendDB(t)
	for _, ref := range []string{"4D", "4C", "4B", "4A"} {
		seedProblemWithStatement(t, db, ref, 900, `["math"]`, "")
	}

	out := missingStatements(t, db, "limit=2")
	got := pendingRefs(t, out)
	if len(got) != 2 {
		t.Fatalf("%d handed out, want the requested 2", len(got))
	}
	if got[0] != "4A" || got[1] != "4B" {
		t.Errorf("order = %v, want it stable by ref", got)
	}
	// remaining counts everything that matches, not just this batch, so the caller can
	// print "37 left" instead of "2 left" forever.
	if out["remaining"] != float64(4) {
		t.Errorf("remaining = %v, want all 4 matches", out["remaining"])
	}

	// Anything above the cap is clamped rather than honoured: one call must stay a few
	// seconds of work.
	if got := pendingRefs(t, missingStatements(t, db, "limit=500")); len(got) != 4 {
		t.Errorf("%d handed out for limit=500, want the 4 that exist", len(got))
	}
}
