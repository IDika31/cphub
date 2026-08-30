package handler

import (
	"encoding/json"
	"io"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// setupRecommendDB creates the four tables the recommender reads: the shared library, the
// two submission tables that say what this user has already touched, and the account its
// rating comes from. Explicit DDL for the same reason as the other fixtures here —
// production runs plain SQL migrations, and an AutoMigrate would paper over a drift.
func setupRecommendDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	for _, q := range []string{
		`CREATE TABLE problems (
			id TEXT PRIMARY KEY, provider TEXT, problem_id TEXT, title TEXT, statement TEXT,
			input_spec TEXT, output_spec TEXT, note TEXT, problem_group TEXT,
			difficulty INTEGER, time_limit TEXT, memory_limit TEXT, tags TEXT, materials TEXT,
			url TEXT, status TEXT, synced_at DATETIME, created_at DATETIME, updated_at DATETIME
		)`,
		`CREATE TABLE external_submissions (
			id TEXT PRIMARY KEY, user_id TEXT, provider TEXT, problem_ref TEXT, verdict TEXT,
			created_at DATETIME
		)`,
		`CREATE TABLE local_submissions (
			id TEXT PRIMARY KEY, user_id TEXT, problem_id TEXT, verdict TEXT, created_at DATETIME
		)`,
		`CREATE TABLE linked_accounts (
			id TEXT PRIMARY KEY, user_id TEXT, provider TEXT, handle TEXT, rating INTEGER,
			is_connected NUMERIC
		)`,
	} {
		if err := db.Exec(q).Error; err != nil {
			t.Fatalf("create table: %v", err)
		}
	}
	return db
}

func seedCFRating(t *testing.T, db *gorm.DB, uid uuid.UUID, rating int) {
	t.Helper()
	err := db.Exec(
		`INSERT INTO linked_accounts (id, user_id, provider, handle, rating, is_connected)
		 VALUES (?, ?, 'codeforces', 'IDika', ?, 1)`,
		uuid.New().String(), uid.String(), rating,
	).Error
	if err != nil {
		t.Fatalf("seed rating: %v", err)
	}
}

func seedCandidate(t *testing.T, db *gorm.DB, ref string, difficulty int, tags string) uuid.UUID {
	t.Helper()
	id := uuid.New()
	err := db.Exec(
		`INSERT INTO problems (id, provider, problem_id, title, difficulty, tags, materials, url, created_at)
		 VALUES (?, 'codeforces', ?, ?, ?, ?, '[]', ?, CURRENT_TIMESTAMP)`,
		id.String(), ref, "problem "+ref, difficulty, tags,
		"https://codeforces.com/problemset/problem/"+ref,
	).Error
	if err != nil {
		t.Fatalf("seed problem %s: %v", ref, err)
	}
	return id
}

func seedExternal(t *testing.T, db *gorm.DB, uid uuid.UUID, ref, verdict string) {
	t.Helper()
	err := db.Exec(
		`INSERT INTO external_submissions (id, user_id, provider, problem_ref, verdict)
		 VALUES (?, ?, 'codeforces', ?, ?)`,
		uuid.New().String(), uid.String(), ref, verdict,
	).Error
	if err != nil {
		t.Fatalf("seed external submission %s: %v", ref, err)
	}
}

func recommend(t *testing.T, db *gorm.DB, uid uuid.UUID) map[string]any {
	t.Helper()
	return recommendQuery(t, db, uid, "")
}

// recommendQuery is the same request with a query string, for the tag filter the practice
// page's chips send.
func recommendQuery(t *testing.T, db *gorm.DB, uid uuid.UUID, query string) map[string]any {
	t.Helper()
	h := &DashboardHandler{db: db}
	app := fiber.New()
	app.Get("/r", func(c *fiber.Ctx) error {
		c.Locals("userId", uid.String())
		return h.Recommendations(c)
	})
	target := "/r"
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

// refsIn names the picks, so a failure says which problems came back rather than only how
// many.
func refsIn(t *testing.T, out map[string]any) []string {
	t.Helper()
	rows, _ := out["data"].([]any)
	refs := make([]string, 0, len(rows))
	for _, r := range rows {
		m, ok := r.(map[string]any)
		if !ok {
			t.Fatalf("unexpected row shape: %#v", r)
		}
		refs = append(refs, m["problemId"].(string))
	}
	return refs
}

// The whole point: problems in this user's band, in a tag they keep failing, that they have
// not touched.
func TestRecommendationsPicksUntouchedProblemsInWeakTags(t *testing.T) {
	db := setupRecommendDB(t)
	me := uuid.New()
	seedCFRating(t, db, me, 1500)

	// Two failed dp problems, because one is a bad day rather than a weakness — the
	// recommender ignores a tag with fewer than recommendMinAttempts problems behind it.
	// Both rows have to join to a problem for the tag record to see them.
	seedCandidate(t, db, "100A", 1500, `["dp","math"]`)
	seedCandidate(t, db, "100B", 1500, `["dp"]`)
	seedExternal(t, db, me, "100A", "WRONG_ANSWER")
	seedExternal(t, db, me, "100B", "TIME_LIMIT_EXCEEDED")

	seedCandidate(t, db, "200B", 1600, `["dp"]`)      // in band, weak tag, untouched
	seedCandidate(t, db, "200C", 1600, `["strings"]`) // in band, but not a weak tag
	seedCandidate(t, db, "200D", 2600, `["dp"]`)      // weak tag, far above the band

	got := refsIn(t, recommend(t, db, me))
	if len(got) != 1 || got[0] != "200B" {
		t.Fatalf("picks = %v, want only 200B", got)
	}
}

// A problem already attempted is not a recommendation, it is the tab the user has open.
func TestRecommendationsSkipsAnythingAlreadyTouched(t *testing.T) {
	db := setupRecommendDB(t)
	me := uuid.New()
	seedCFRating(t, db, me, 1500)

	// greedy becomes the weak tag through two failed attempts, both well below the band so
	// they cannot be picked themselves.
	seedCandidate(t, db, "100A", 900, `["greedy"]`)
	seedCandidate(t, db, "100B", 900, `["greedy"]`)
	seedExternal(t, db, me, "100A", "WRONG_ANSWER")
	seedExternal(t, db, me, "100B", "WRONG_ANSWER")

	seedCandidate(t, db, "300A", 1500, `["greedy"]`)
	seedExternal(t, db, me, "300A", "OK")
	locallyRun := seedCandidate(t, db, "300B", 1500, `["greedy"]`)
	if err := db.Exec(
		`INSERT INTO local_submissions (id, user_id, problem_id, verdict) VALUES (?, ?, ?, 'WA')`,
		uuid.New().String(), me.String(), locallyRun.String(),
	).Error; err != nil {
		t.Fatalf("seed local run: %v", err)
	}
	seedCandidate(t, db, "300C", 1500, `["greedy"]`)

	got := refsIn(t, recommend(t, db, me))
	if len(got) != 1 || got[0] != "300C" {
		t.Errorf("picks = %v, want only 300C — 300A was solved and 300B was run locally", got)
	}
}

// Where the band comes from, in the three cases the panel has to explain.
func TestRatingBandSources(t *testing.T) {
	t.Run("from the linked account", func(t *testing.T) {
		db := setupRecommendDB(t)
		h := &DashboardHandler{db: db}
		me := uuid.New()
		seedCFRating(t, db, me, 1575)

		lo, hi, basis := h.ratingBand(me, "codeforces")
		if lo != 1475 || hi != 1875 || basis != "rating" {
			t.Errorf("band = %d..%d (%s), want 1475..1875 (rating)", lo, hi, basis)
		}
	})

	t.Run("from what they have solved", func(t *testing.T) {
		db := setupRecommendDB(t)
		h := &DashboardHandler{db: db}
		me := uuid.New()
		seedCandidate(t, db, "1A", 1200, `["dp"]`)
		seedCandidate(t, db, "1B", 1400, `["dp"]`)
		seedExternal(t, db, me, "1A", "OK")
		seedExternal(t, db, me, "1B", "OK")

		lo, hi, basis := h.ratingBand(me, "codeforces")
		if basis != "solved" || lo != 1200 || hi != 1600 {
			t.Errorf("band = %d..%d (%s), want 1200..1600 from the 1300 average", lo, hi, basis)
		}
	})

	t.Run("nothing to go on", func(t *testing.T) {
		db := setupRecommendDB(t)
		h := &DashboardHandler{db: db}
		lo, hi, basis := h.ratingBand(uuid.New(), "codeforces")
		if basis != "default" || lo != 800 || hi != 1300 {
			t.Errorf("band = %d..%d (%s), want the beginner range", lo, hi, basis)
		}
	})

	// Nothing exists below 800 on Codeforces, so the band must not open under it.
	t.Run("never below the floor", func(t *testing.T) {
		db := setupRecommendDB(t)
		h := &DashboardHandler{db: db}
		me := uuid.New()
		seedCFRating(t, db, me, 820)

		lo, _, _ := h.ratingBand(me, "codeforces")
		if lo != 800 {
			t.Errorf("lo = %d, want the 800 floor", lo)
		}
	})
}

// The chips on the practice page are filters, not labels: asking for a tag has to narrow
// the picks to that tag even when the derived weak set says something else.
func TestRecommendationsHonourTheRequestedTag(t *testing.T) {
	db := setupRecommendDB(t)
	me := uuid.New()
	seedCFRating(t, db, me, 1500)

	// dp is the weak tag, twice over.
	seedCandidate(t, db, "100A", 1500, `["dp"]`)
	seedCandidate(t, db, "100B", 1500, `["dp"]`)
	seedExternal(t, db, me, "100A", "WRONG_ANSWER")
	seedExternal(t, db, me, "100B", "WRONG_ANSWER")
	// One candidate per tag, both in band and untouched.
	seedCandidate(t, db, "200A", 1600, `["dp"]`)
	seedCandidate(t, db, "200B", 1600, `["strings"]`)

	if got := refsIn(t, recommend(t, db, me)); len(got) != 1 || got[0] != "200A" {
		t.Fatalf("unfiltered picks = %v, want the dp problem", got)
	}

	out := recommendQuery(t, db, me, "tag=strings")
	if got := refsIn(t, out); len(got) != 1 || got[0] != "200B" {
		t.Errorf("picks for tag=strings = %v, want 200B", got)
	}
	basis, _ := out["basis"].(map[string]any)
	if basis["tag"] != "strings" {
		t.Errorf("basis.tag = %v, want strings echoed back", basis["tag"])
	}
	// The chips have to survive being clicked: the option list is the user's whole record,
	// not just the tags this response drew from.
	options, _ := basis["tagOptions"].([]any)
	if len(options) == 0 || options[0] != "dp" {
		t.Errorf("basis.tagOptions = %v, want dp still listed", options)
	}
}
