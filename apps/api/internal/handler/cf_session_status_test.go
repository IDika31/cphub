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

// setupAccountDB mirrors the linked_accounts columns model.LinkedAccount maps. Written
// out rather than AutoMigrated for the same reason as the other fixtures here: the
// production schema is plain SQL, and a gorm-generated table would hide a drift.
func setupAccountDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	if err := db.Exec(`CREATE TABLE linked_accounts (
		id TEXT PRIMARY KEY, user_id TEXT NOT NULL, provider TEXT NOT NULL,
		provider_user_id TEXT, handle TEXT, provider_username TEXT, display_name TEXT,
		access_token TEXT, refresh_token TEXT, token_expiry DATETIME,
		session_data TEXT, password_enc TEXT, session_checked_at DATETIME,
		rating INTEGER DEFAULT 0, max_rating INTEGER DEFAULT 0, avatar_url TEXT,
		is_connected NUMERIC DEFAULT 1, total_score INTEGER DEFAULT 0,
		problems_tried INTEGER DEFAULT 0, problems_solved INTEGER DEFAULT 0,
		stats_synced_at DATETIME, linked_at DATETIME, created_at DATETIME, updated_at DATETIME
	)`).Error; err != nil {
		t.Fatalf("create linked_accounts: %v", err)
	}
	return db
}

func seedCFAccount(t *testing.T, db *gorm.DB, uid uuid.UUID, sessionData string, connected bool) {
	t.Helper()
	now := time.Now()
	acc := model.LinkedAccount{
		ID: uuid.New(), UserID: uid, Provider: "codeforces", Handle: "IDika",
		SessionData: sessionData, IsConnected: connected, SessionCheckedAt: &now, LinkedAt: now,
	}
	if err := db.Create(&acc).Error; err != nil {
		t.Fatalf("seed account: %v", err)
	}
	// is_connected carries `gorm:"default:true"`, and GORM reads a false in a Create as
	// "no value given, let the column default apply" — so seeding a disconnected
	// account through the struct silently stores it as connected. Written explicitly,
	// which is also how markSessionExpired writes it (Update on the column, not a
	// struct).
	if !connected {
		if err := db.Model(&model.LinkedAccount{}).Where("id = ?", acc.ID).
			Update("is_connected", false).Error; err != nil {
			t.Fatalf("seed disconnected: %v", err)
		}
	}
}

// sessionStatus drives the handler through a real request: it reads the viewer from
// c.Locals and the probe flag from the query, and both are part of what is tested.
func sessionStatus(t *testing.T, db *gorm.DB, uid uuid.UUID) map[string]any {
	t.Helper()
	h := &CFWebHandler{db: db}
	app := fiber.New()
	app.Get("/session", func(c *fiber.Ctx) error {
		c.Locals("userId", uid.String())
		return h.SessionStatus(c)
	})
	resp, err := app.Test(httptest.NewRequest(fiber.MethodGet, "/session", nil))
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

// Nobody linked: the sidebar entry must stay hidden rather than nag a user who does
// not use Codeforces at all.
func TestSessionStatusNotLinked(t *testing.T) {
	db := setupAccountDB(t)
	out := sessionStatus(t, db, uuid.New())
	if out["linked"] != false || out["valid"] != false || out["reason"] != "not_linked" {
		t.Errorf("out = %v, want linked/valid false with reason not_linked", out)
	}
}

func TestSessionStatusLiveSession(t *testing.T) {
	db := setupAccountDB(t)
	me := uuid.New()
	seedCFAccount(t, db, me, `{"handle":"IDika","cookies":[{"name":"JSESSIONID","value":"x"}]}`, true)

	out := sessionStatus(t, db, me)
	if out["valid"] != true {
		t.Errorf("valid = %v, want true", out["valid"])
	}
	if out["handle"] != "IDika" {
		t.Errorf("handle = %v, want IDika", out["handle"])
	}
	if _, has := out["reason"]; has {
		t.Errorf("reason = %v, want none for a live session", out["reason"])
	}
	if out["checkedAt"] == nil {
		t.Error("checkedAt missing — the page prints when it was last verified")
	}
}

// The two ways a session stops working, kept apart because the page says something
// different for each: never captured, versus captured and since refused.
func TestSessionStatusDistinguishesNoSessionFromExpired(t *testing.T) {
	db := setupAccountDB(t)
	fresh, stale := uuid.New(), uuid.New()
	seedCFAccount(t, db, fresh, "", true)
	seedCFAccount(t, db, stale, `{"handle":"IDika"}`, false)

	if out := sessionStatus(t, db, fresh); out["valid"] != false || out["reason"] != "no_session" {
		t.Errorf("no-session account: out = %v", out)
	}
	if out := sessionStatus(t, db, stale); out["valid"] != false || out["reason"] != "expired" {
		t.Errorf("expired account: out = %v", out)
	}
}

// markSessionExpired is what every server-side action calls when Codeforces refuses
// the stored session, and it is the only reason the cheap read above can be trusted.
func TestMarkSessionExpiredFlipsTheFlag(t *testing.T) {
	db := setupAccountDB(t)
	me := uuid.New()
	seedCFAccount(t, db, me, `{"handle":"IDika"}`, true)

	h := &CFWebHandler{db: db}
	h.markSessionExpired(me)

	out := sessionStatus(t, db, me)
	if out["valid"] != false || out["reason"] != "expired" {
		t.Errorf("out = %v, want valid false / expired after the flag was set", out)
	}
}
