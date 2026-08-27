package handler

import (
	"log"
	"strings"
	"time"

	"github.com/IDika31/cphub/api/internal/model"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm/clause"
)

// ContestStatesFromExtension takes what the extension read off codeforces.com/contests
// in the user's own browser.
//
// This is the only accurate source. Codeforces exposes registration state in no API —
// contest.standings refuses a contest that has not started, which is exactly when
// registration is open, and there is no registrants method — while its own contest list
// shows all three states for every upcoming round in a single page. So the extension
// reads that page once and reports what it saw, instead of CPHub guessing from a start
// time or paying a Cloudflare solve per contest.
//
// It is also what teaches CPHub about registrations made straight on codeforces.com,
// which no amount of recording our own actions could ever discover.
//
// Registered is a tri-state, and that is load-bearing: a nil means the page stated
// nothing this parser understands, and such a row must be left alone rather than read as
// "not registered", because the not-registered branch DELETES. A running round is exactly
// that case — Codeforces drops "Registration completed" from the cell once registration
// closes — so treating silence as a negative deleted the registration of every contest
// the user was actually competing in.
//
// Authenticated by HMACVerify (the /api/sync group), so the caller is the paired
// extension of exactly one account.
func (h *CFWebHandler) ContestStatesFromExtension(c *fiber.Ctx) error {
	uid, err := uuid.Parse(c.Locals("userId").(string))
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "Unauthenticated"})
	}

	var in struct {
		States []ExtensionContestState `json:"states"`
	}
	if err := c.BodyParser(&in); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Body tidak bisa dibaca"})
	}
	if len(in.States) == 0 {
		return c.Status(400).JSON(fiber.Map{"error": "tidak ada status contest yang dikirim"})
	}

	now := time.Now()
	var unknown, windows int
	// Sorted into two lists first and written in two statements, rather than a query per
	// row. A sync covers every upcoming contest, and a per-row insert-or-delete made that
	// one round trip each — enough that the page's own load waited on the database.
	var enter []model.ContestRegistration
	var leave []string

	for _, st := range in.States {
		ref := strings.TrimSpace(st.ContestRef)
		if ref == "" {
			continue
		}

		switch {
		case st.Registered == nil:
			// The page said nothing about this one. Neither recorded nor cleared: what
			// CPHub already knows is better than a guess.
			unknown++
		case *st.Registered:
			enter = append(enter, model.ContestRegistration{
				ID: uuid.New(), UserID: uid, Provider: "codeforces", ContestRef: ref, RegisteredAt: now,
			})
		default:
			// Not registered is a real answer, not an absence: the user may have
			// withdrawn, or CPHub may hold a stale row from an earlier sync. Codeforces'
			// own page is the authority here, so a row that contradicts it goes.
			leave = append(leave, ref)
		}

		// The window is a property of the contest, so it is written whatever this
		// viewer's own state is — including for a row whose registration state was
		// unreadable. Only when known: a nil here must not erase a value an earlier sync
		// established.
		if st.RegistrationOpensAt != nil {
			res := h.db.Model(&model.Contest{}).
				Where("provider = ? AND contest_ref = ?", "codeforces", ref).
				Update("registration_opens_at", st.RegistrationOpensAt)
			if res.Error != nil {
				log.Printf("[cf-ext] recording registration window %s: %v", ref, res.Error)
			} else if res.RowsAffected > 0 {
				// Only a row that moved counts. A contest the user has not synced yet
				// matches nothing, and counting those made the reply claim work it had
				// not done.
				windows++
			}
		}
	}

	if len(enter) > 0 {
		// DoNothing on the (user, provider, contest_ref) unique index: a registration
		// already on file keeps its original registered_at, which is the truer timestamp.
		if err := h.db.Clauses(clause.OnConflict{DoNothing: true}).Create(&enter).Error; err != nil {
			log.Printf("[cf-ext] recording %d registrations: %v", len(enter), err)
		}
	}
	if len(leave) > 0 {
		if err := h.db.Where("user_id = ? AND provider = ? AND contest_ref IN ?", uid, "codeforces", leave).
			Delete(&model.ContestRegistration{}).Error; err != nil {
			log.Printf("[cf-ext] clearing %d registrations: %v", len(leave), err)
		}
	}

	log.Printf("[cf-ext] contest states from browser (user=%s): %d seen, %d registered, %d cleared, %d unstated, %d windows",
		uid, len(in.States), len(enter), len(leave), unknown, windows)
	return c.JSON(fiber.Map{
		"seen":       len(in.States),
		"registered": len(enter),
		"cleared":    len(leave),
		"unknown":    unknown,
		"windows":    windows,
	})
}

// RecordRegistration files a registration the extension performed in the user's browser.
//
// The extension acts on Codeforces; CPHub's own record is written here, so the contest list
// stops offering a button for a round the user is already in. Split that way because the
// extension has no session with CPHub — it authenticates per request — while the web app
// already holds the user's JWT.
//
// Idempotent: registering twice is a no-op on Codeforces too.
func (h *CFWebHandler) RecordRegistration(c *fiber.Ctx) error {
	uid, err := uuid.Parse(c.Locals("userId").(string))
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "Unauthenticated"})
	}
	ref := strings.TrimSpace(c.Params("id"))
	if ref == "" {
		return c.Status(400).JSON(fiber.Map{"error": "contestId tidak valid"})
	}

	reg := model.ContestRegistration{
		UserID: uid, Provider: "codeforces", ContestRef: ref, RegisteredAt: time.Now(),
	}
	if err := h.db.Where("user_id = ? AND provider = ? AND contest_ref = ?", uid, "codeforces", ref).
		FirstOrCreate(&reg).Error; err != nil {
		log.Printf("[cf-ext] recording browser registration %s: %v", ref, err)
		return c.Status(500).JSON(fiber.Map{"error": "Gagal menyimpan registrasi"})
	}
	log.Printf("[cf-ext] recorded browser registration for contest %s (user=%s)", ref, uid)
	return c.JSON(fiber.Map{"contestRef": ref, "registered": true})
}

// ExtensionContestState is one contest as the extension found it on Codeforces' own list.
type ExtensionContestState struct {
	ContestRef string `json:"contestRef"`
	// Registered is nil when the page stated nothing readable about this contest, false
	// when it offered registration, true when it said the account is in. The nil case is
	// why this is a pointer: see the type comment on ContestStatesFromExtension.
	Registered *bool `json:"registered"`
	// RegistrationOpensAt is set only when the page said registration had not opened
	// yet. Absent means either open already, or not stated.
	RegistrationOpensAt *time.Time `json:"registrationOpensAt,omitempty"`
}
