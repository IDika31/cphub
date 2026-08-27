package handler

import (
	"encoding/json"
	"io"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/IDika31/cphub/api/internal/model"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// setupRegistrationDB mirrors the sqlite-in-memory pattern in internal/service, with the
// one table under test. The DDL is written out rather than AutoMigrated because the
// production schema is plain SQL migrations, and a gorm-generated table would let a
// mismatch between the two go unnoticed.
func setupRegistrationDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	if err := db.Exec(`CREATE TABLE contest_registrations (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL,
		provider TEXT NOT NULL,
		contest_ref TEXT NOT NULL,
		registered_at DATETIME NOT NULL,
		UNIQUE (user_id, provider, contest_ref)
	)`).Error; err != nil {
		t.Fatalf("create table: %v", err)
	}
	return db
}

// createContestsTable mirrors the columns migrations/000009 and 000012 produce. It lives
// here rather than in each test that needs it because two copies drifted the moment
// registration_opens_at was added, and the failure surfaced as an unrelated assertion.
func createContestsTable(t *testing.T, db *gorm.DB) {
	t.Helper()
	if err := db.Exec(`CREATE TABLE contests (
		id TEXT PRIMARY KEY, provider TEXT, contest_ref TEXT, name TEXT,
		type TEXT, phase TEXT, frozen NUMERIC, start_time DATETIME,
		registration_opens_at DATETIME, duration_seconds INTEGER, url TEXT,
		synced_at DATETIME, created_at DATETIME, updated_at DATETIME
	)`).Error; err != nil {
		t.Fatalf("create contests: %v", err)
	}
}

func addRegistration(t *testing.T, db *gorm.DB, uid uuid.UUID, provider, ref string) {
	t.Helper()
	reg := model.ContestRegistration{
		ID: uuid.New(), UserID: uid, Provider: provider, ContestRef: ref, RegisteredAt: time.Now(),
	}
	if err := db.Create(&reg).Error; err != nil {
		t.Fatalf("seed registration %s/%s: %v", provider, ref, err)
	}
}

// markThrough runs markRegistered inside a real request, because it reads the viewer
// from c.Locals and that is exactly the part worth exercising.
func markThrough(t *testing.T, db *gorm.DB, uid string, rows []model.Contest) []model.Contest {
	t.Helper()
	h := &CFSyncHandler{db: db}
	app := fiber.New()
	app.Get("/contests", func(c *fiber.Ctx) error {
		if uid != "" {
			c.Locals("userId", uid)
		}
		h.markRegistered(c, rows)
		return c.JSON(rows)
	})
	resp, err := app.Test(httptest.NewRequest(fiber.MethodGet, "/contests", nil))
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()

	var out []model.Contest
	if err := json.Unmarshal(body, &out); err != nil {
		t.Fatalf("bad JSON %s", body)
	}
	return out
}

func TestMarkRegisteredFlagsOnlyTheViewersContests(t *testing.T) {
	db := setupRegistrationDB(t)
	me, someoneElse := uuid.New(), uuid.New()
	addRegistration(t, db, me, "codeforces", "2258")
	// Another account in the same round. A per-user flag that leaked here would tell one
	// user they are registered because a different user is.
	addRegistration(t, db, someoneElse, "codeforces", "2259")

	out := markThrough(t, db, me.String(), []model.Contest{
		{Provider: "codeforces", ContestRef: "2258", Name: "mine"},
		{Provider: "codeforces", ContestRef: "2259", Name: "theirs"},
	})

	if !out[0].Registered {
		t.Error("2258: Registered = false, want true — this viewer signed up for it")
	}
	if out[1].Registered {
		t.Error("2259: Registered = true, want false — that registration belongs to another user")
	}
}

// contest_ref is the provider's own id, so two judges can both call a contest "2258".
// Keying the lookup on the ref alone would mark a Codeforces round as registered because
// the user joined an unrelated TLX one.
func TestMarkRegisteredDoesNotCrossProviders(t *testing.T) {
	db := setupRegistrationDB(t)
	me := uuid.New()
	addRegistration(t, db, me, "tlx", "2258")

	out := markThrough(t, db, me.String(), []model.Contest{
		{Provider: "codeforces", ContestRef: "2258", Name: "codeforces round"},
		{Provider: "tlx", ContestRef: "2258", Name: "tlx round"},
	})

	if out[0].Registered {
		t.Error("codeforces/2258 marked registered from a tlx registration")
	}
	if !out[1].Registered {
		t.Error("tlx/2258 not marked, though that is the one that was registered")
	}
}

// An anonymous or unparseable viewer must leave every flag false rather than fail the
// request: the list still renders, and a Register button that was not needed costs one
// click, while a hidden one could keep someone out of a round.
func TestMarkRegisteredIgnoresMissingViewer(t *testing.T) {
	db := setupRegistrationDB(t)
	rows := []model.Contest{{Provider: "codeforces", ContestRef: "2258"}}

	for _, uid := range []string{"", "not-a-uuid"} {
		out := markThrough(t, db, uid, rows)
		if out[0].Registered {
			t.Errorf("uid %q: Registered = true, want false", uid)
		}
	}
}

// Registered is a view field: it must never become a column, or the contest sync's upsert
// would try to write one viewer's state onto a row every viewer shares.
func TestContestRegisteredIsNotAColumn(t *testing.T) {
	db := setupRegistrationDB(t)
	createContestsTable(t, db)
	// No "registered" column exists, so this insert only succeeds if gorm honours
	// `gorm:"-"` and leaves the field out of the statement.
	row := model.Contest{ID: uuid.New(), Provider: "codeforces", ContestRef: "2258", Registered: true}
	if err := db.Create(&row).Error; err != nil {
		t.Fatalf("Registered leaked into the INSERT: %v", err)
	}
}
