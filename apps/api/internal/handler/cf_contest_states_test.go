package handler

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/IDika31/cphub/api/internal/model"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// setupContestStateDB adds the contests table to the registration fixture, since the
// state sync writes to both.
func setupContestStateDB(t *testing.T) *gorm.DB {
	t.Helper()
	db := setupRegistrationDB(t)
	createContestsTable(t, db)
	return db
}

// registeredState spells out a tri-state in a literal. The field is a pointer because nil
// means "the page did not say", which the handler must treat differently from false — see
// TestContestStatesKeepsRegistrationWhenStateUnstated.
func registeredState(v bool) *bool { return &v }

func seedContest(t *testing.T, db *gorm.DB, ref string) {
	t.Helper()
	row := model.Contest{ID: uuid.New(), Provider: "codeforces", ContestRef: ref, Name: "round " + ref}
	if err := db.Create(&row).Error; err != nil {
		t.Fatalf("seed contest %s: %v", ref, err)
	}
}

// postStates drives the handler through a real request, because it reads the viewer from
// c.Locals and the body through BodyParser.
func postStates(t *testing.T, db *gorm.DB, uid string, states []ExtensionContestState) map[string]any {
	t.Helper()
	h := &CFWebHandler{db: db}
	app := fiber.New()
	app.Post("/sync", func(c *fiber.Ctx) error {
		c.Locals("userId", uid)
		return h.ContestStatesFromExtension(c)
	})

	body, err := json.Marshal(map[string]any{"states": states})
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(fiber.MethodPost, "/sync", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req)
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

func TestContestStatesRecordsRegistrations(t *testing.T) {
	db := setupContestStateDB(t)
	me := uuid.New()
	seedContest(t, db, "2258")
	seedContest(t, db, "2259")
	opens := time.Date(2026, 9, 1, 13, 8, 9, 0, time.UTC)

	out := postStates(t, db, me.String(), []ExtensionContestState{
		{ContestRef: "2258", Registered: registeredState(true)},
		{ContestRef: "2259", Registered: registeredState(false), RegistrationOpensAt: &opens},
	})
	if out["registered"] != float64(1) {
		t.Errorf("registered = %v, want 1", out["registered"])
	}

	var regs []model.ContestRegistration
	db.Where("user_id = ?", me).Find(&regs)
	if len(regs) != 1 || regs[0].ContestRef != "2258" {
		t.Errorf("registrations = %+v, want only 2258", regs)
	}

	// The window belongs to the contest, so it is written even though this viewer is not
	// registered for that round.
	var c model.Contest
	db.Where("contest_ref = ?", "2259").First(&c)
	if c.RegistrationOpensAt == nil || !c.RegistrationOpensAt.UTC().Equal(opens) {
		t.Errorf("registration_opens_at = %v, want %v", c.RegistrationOpensAt, opens)
	}
}

// Codeforces' own page is the authority. A row CPHub kept from an earlier sync — or from a
// registration the user has since withdrawn — has to go, or the list would keep claiming
// they are in a round they are not.
func TestContestStatesClearsStaleRegistrations(t *testing.T) {
	db := setupContestStateDB(t)
	me := uuid.New()
	seedContest(t, db, "2258")
	addRegistration(t, db, me, "codeforces", "2258")

	postStates(t, db, me.String(), []ExtensionContestState{{ContestRef: "2258", Registered: registeredState(false)}})

	var count int64
	db.Model(&model.ContestRegistration{}).Where("user_id = ?", me).Count(&count)
	if count != 0 {
		t.Errorf("%d registrations left, want 0 — Codeforces said this user is not registered", count)
	}
}

// Clearing must be scoped to the viewer, or one user's sync would unregister everyone else.
func TestContestStatesClearOnlyTouchesTheViewer(t *testing.T) {
	db := setupContestStateDB(t)
	me, other := uuid.New(), uuid.New()
	seedContest(t, db, "2258")
	addRegistration(t, db, me, "codeforces", "2258")
	addRegistration(t, db, other, "codeforces", "2258")

	postStates(t, db, me.String(), []ExtensionContestState{{ContestRef: "2258", Registered: registeredState(false)}})

	var count int64
	db.Model(&model.ContestRegistration{}).Where("user_id = ?", other).Count(&count)
	if count != 1 {
		t.Errorf("the other user's registration was %d, want 1 — it must be untouched", count)
	}
}

// A nil window means "the page did not say", which must not erase what an earlier sync
// established: registration opening is stated only while it is still in the future.
func TestContestStatesKeepsKnownWindowWhenUnstated(t *testing.T) {
	db := setupContestStateDB(t)
	me := uuid.New()
	seedContest(t, db, "2259")
	opens := time.Date(2026, 9, 1, 13, 8, 9, 0, time.UTC)

	postStates(t, db, me.String(), []ExtensionContestState{{ContestRef: "2259", RegistrationOpensAt: &opens}})
	postStates(t, db, me.String(), []ExtensionContestState{{ContestRef: "2259"}})

	var c model.Contest
	db.Where("contest_ref = ?", "2259").First(&c)
	if c.RegistrationOpensAt == nil {
		t.Error("registration_opens_at was erased by a sync that did not mention it")
	}
}

func TestContestStatesRejectsEmptyBody(t *testing.T) {
	db := setupContestStateDB(t)
	out := postStates(t, db, uuid.New().String(), nil)
	if out["error"] == nil {
		t.Errorf("out = %v, want an error: nothing was reported", out)
	}
}

// The case that cost data. A past contest's row states no registration at all — measured,
// its last cell holds only the registrant-count link — and /contests carries a hundred of
// them per page. The old parser reported every one as `false`, which deleted the user's
// registration history. An unstated row must change nothing.
func TestContestStatesKeepsRegistrationWhenStateUnstated(t *testing.T) {
	db := setupContestStateDB(t)
	me := uuid.New()
	seedContest(t, db, "2258")
	addRegistration(t, db, me, "codeforces", "2258")

	out := postStates(t, db, me.String(), []ExtensionContestState{{ContestRef: "2258"}})

	var count int64
	db.Model(&model.ContestRegistration{}).Where("user_id = ?", me).Count(&count)
	if count != 1 {
		t.Errorf("%d registrations left, want 1 — the page stated nothing, so nothing should change", count)
	}
	if out["unknown"] != float64(1) {
		t.Errorf("unknown = %v, want 1 — an unreadable row is worth reporting", out["unknown"])
	}
	if out["cleared"] != float64(0) {
		t.Errorf("cleared = %v, want 0", out["cleared"])
	}
}

// A window still belongs to the contest when this viewer's own state is unreadable: the two
// facts are independent, and dropping the window would mean re-reading it next sync.
func TestContestStatesRecordsWindowEvenWhenStateUnstated(t *testing.T) {
	db := setupContestStateDB(t)
	seedContest(t, db, "2259")
	opens := time.Date(2026, 9, 1, 13, 8, 9, 0, time.UTC)

	postStates(t, db, uuid.New().String(), []ExtensionContestState{{ContestRef: "2259", RegistrationOpensAt: &opens}})

	var c model.Contest
	db.Where("contest_ref = ?", "2259").First(&c)
	if c.RegistrationOpensAt == nil || !c.RegistrationOpensAt.UTC().Equal(opens) {
		t.Errorf("registration_opens_at = %v, want %v", c.RegistrationOpensAt, opens)
	}
}

// The counter answers "what did this sync actually do", so a contest CPHub has never synced
// must not be counted as a window written: nothing moved.
func TestContestStatesDoesNotCountWindowsItCouldNotWrite(t *testing.T) {
	db := setupContestStateDB(t)
	opens := time.Date(2026, 9, 1, 13, 8, 9, 0, time.UTC)

	out := postStates(t, db, uuid.New().String(), []ExtensionContestState{{ContestRef: "9999", RegistrationOpensAt: &opens}})

	if out["windows"] != float64(0) {
		t.Errorf("windows = %v, want 0 — contest 9999 is not in this database", out["windows"])
	}
}
