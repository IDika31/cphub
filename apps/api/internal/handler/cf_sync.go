package handler

import (
	"encoding/json"
	"log"
	"strconv"
	"time"

	"github.com/IDika31/cphub/api/internal/model"
	"github.com/IDika31/cphub/api/internal/provider/codeforces"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// CFSyncHandler pulls Codeforces data through the official API. The API is the
// only door still open to a server: every HTML page answers 403 behind a
// Cloudflare challenge, so scraping cannot be the source for problem metadata,
// contests or submissions any more.
type CFSyncHandler struct {
	db  *gorm.DB
	api *codeforces.API
}

func NewCFSyncHandler(db *gorm.DB, apiKey, apiSecret string) *CFSyncHandler {
	return &CFSyncHandler{db: db, api: codeforces.NewAPI(apiKey, apiSecret)}
}

// problemUpsert keeps statement, input/output spec, note and status out of the
// update set: those come from a statement fetch or from the user, and a metadata
// refresh must not blank them.
var problemUpsert = clause.OnConflict{
	Columns:   []clause.Column{{Name: "provider"}, {Name: "problem_id"}},
	DoUpdates: clause.AssignmentColumns([]string{"title", "difficulty", "tags", "url", "synced_at", "updated_at"}),
}

// SyncProblemset imports the whole public problemset — roughly ten thousand
// problems with rating and tags, no statements, since the API has no method that
// returns them.
func (h *CFSyncHandler) SyncProblemset(c *fiber.Ctx) error {
	started := time.Now()
	problems, _, err := h.api.ProblemsetProblems(c.Query("tags"))
	if err != nil {
		log.Printf("[cf-sync] problemset fetch failed: %v", err)
		return c.Status(fiber.StatusFailedDependency).JSON(fiber.Map{"error": "Gagal mengambil problemset Codeforces: " + err.Error()})
	}

	rows := make([]model.Problem, 0, len(problems))
	now := time.Now()
	for _, p := range problems {
		if p.ContestID == 0 || p.Index == "" {
			continue // acmsguru and similar entries have no problemset URL
		}
		tags, _ := json.Marshal(p.Tags)
		rows = append(rows, model.Problem{
			Provider:   "codeforces",
			ProblemID:  p.Ref(),
			Title:      p.Name,
			Difficulty: p.Rating,
			Tags:       string(tags),
			URL:        p.URL(),
			SyncedAt:   now,
		})
	}

	written := 0
	for start := 0; start < len(rows); start += 500 {
		end := start + 500
		if end > len(rows) {
			end = len(rows)
		}
		batch := rows[start:end]
		if err := h.db.Clauses(problemUpsert).Create(&batch).Error; err != nil {
			log.Printf("[cf-sync] problemset batch %d failed: %v", start, err)
			return c.Status(500).JSON(fiber.Map{"error": "Gagal menyimpan problemset", "written": written})
		}
		written += len(batch)
	}

	log.Printf("[cf-sync] problemset: %d fetched, %d written in %s", len(problems), written, time.Since(started).Round(time.Millisecond))
	return c.JSON(fiber.Map{
		"fetched": len(problems),
		"written": written,
		"elapsed": time.Since(started).Round(time.Millisecond).String(),
		"note":    "Statement tidak tersedia lewat API Codeforces — metadata saja (judul, rating, tag).",
	})
}

// SyncContests mirrors contest.list. Upcoming contests are included, which is what
// makes a registration deadline visible before it passes.
func (h *CFSyncHandler) SyncContests(c *fiber.Ctx) error {
	started := time.Now()
	gym := c.QueryBool("gym", false)
	list, err := h.api.ContestList(gym)
	if err != nil {
		log.Printf("[cf-sync] contest.list failed: %v", err)
		return c.Status(fiber.StatusFailedDependency).JSON(fiber.Map{"error": "Gagal mengambil daftar contest: " + err.Error()})
	}

	now := time.Now()
	rows := make([]model.Contest, 0, len(list))
	for _, ct := range list {
		rows = append(rows, model.Contest{
			Provider:        "codeforces",
			ContestRef:      strconv.Itoa(ct.ID),
			Name:            ct.Name,
			Type:            ct.Type,
			Phase:           ct.Phase,
			Frozen:          ct.Frozen,
			StartTime:       ct.StartTime(),
			DurationSeconds: ct.DurationSeconds,
			URL:             ct.URL(),
			SyncedAt:        &now,
		})
	}

	upsert := clause.OnConflict{
		Columns: []clause.Column{{Name: "provider"}, {Name: "contest_ref"}},
		DoUpdates: clause.AssignmentColumns([]string{
			"name", "type", "phase", "frozen", "start_time", "duration_seconds", "url", "synced_at", "updated_at",
		}),
	}
	written := 0
	for start := 0; start < len(rows); start += 500 {
		end := start + 500
		if end > len(rows) {
			end = len(rows)
		}
		batch := rows[start:end]
		if err := h.db.Clauses(upsert).Create(&batch).Error; err != nil {
			log.Printf("[cf-sync] contest batch %d failed: %v", start, err)
			return c.Status(500).JSON(fiber.Map{"error": "Gagal menyimpan contest", "written": written})
		}
		written += len(batch)
	}

	log.Printf("[cf-sync] contests: %d fetched, %d written in %s", len(list), written, time.Since(started).Round(time.Millisecond))
	return c.JSON(fiber.Map{"fetched": len(list), "written": written, "elapsed": time.Since(started).Round(time.Millisecond).String()})
}

// ListContests reads what was synced. `phase=BEFORE` is the upcoming set;
// `upcoming=true` is the same thing expressed as a time filter, for contests whose
// phase has not been refreshed recently.
func (h *CFSyncHandler) ListContests(c *fiber.Ctx) error {
	q := h.db.Model(&model.Contest{})
	if p := c.Query("provider"); p != "" {
		q = q.Where("provider = ?", p)
	}
	if ph := c.Query("phase"); ph != "" {
		q = q.Where("phase = ?", ph)
	}
	if c.QueryBool("upcoming", false) {
		q = q.Where("start_time IS NOT NULL AND start_time > ?", time.Now())
	}
	limit := c.QueryInt("limit", 50)
	if limit < 1 || limit > 500 {
		limit = 50
	}

	var total int64
	q.Count(&total)

	var rows []model.Contest
	// Upcoming reads best soonest-first; everything else newest-first.
	order := "start_time DESC NULLS LAST"
	if c.QueryBool("upcoming", false) {
		order = "start_time ASC"
	}
	if err := q.Order(order).Limit(limit).Offset(c.QueryInt("offset", 0)).Find(&rows).Error; err != nil {
		log.Printf("[cf-sync] contest list failed: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "Gagal memuat contest"})
	}
	h.markRegistered(c, rows)
	return c.JSON(fiber.Map{"data": rows, "total": total})
}

// markRegistered flags the contests this viewer has already signed up for, so the list
// can offer a Register button only where it would do something.
//
// One query for the whole page rather than one per row: the page is up to 500 contests,
// and a per-row lookup would be 500 round trips for a boolean.
//
// A failure here leaves every flag false, which shows a Register button the user may not
// need. That is the right way round — Codeforces treats a second registration as a no-op
// and reports "already registered", so an extra button costs a click, while a wrongly
// hidden one would leave someone unable to enter a round.
func (h *CFSyncHandler) markRegistered(c *fiber.Ctx, rows []model.Contest) {
	if len(rows) == 0 {
		return
	}
	raw, ok := c.Locals("userId").(string)
	if !ok {
		return
	}
	uid, err := uuid.Parse(raw)
	if err != nil {
		return
	}

	refs := make([]string, 0, len(rows))
	for _, r := range rows {
		refs = append(refs, r.ContestRef)
	}
	var registered []model.ContestRegistration
	if err := h.db.Where("user_id = ? AND contest_ref IN ?", uid, refs).Find(&registered).Error; err != nil {
		log.Printf("[cf-sync] registration lookup failed: %v", err)
		return
	}

	// Keyed on provider too: contest_ref is the provider's own id, so "2257" could
	// belong to two different judges.
	inContest := make(map[string]bool, len(registered))
	for _, reg := range registered {
		inContest[reg.Provider+"/"+reg.ContestRef] = true
	}
	for i := range rows {
		rows[i].Registered = inContest[rows[i].Provider+"/"+rows[i].ContestRef]
	}
}

// SyncContestProblems fills in one contest's problems. contest.standings is the
// only public method that exposes them, so it is called with a single standings
// row and only the problem list is kept.
func (h *CFSyncHandler) SyncContestProblems(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return c.Status(400).JSON(fiber.Map{"error": "contestId tidak valid"})
	}

	problems, contest, err := h.api.ContestProblems(id)
	if err != nil {
		log.Printf("[cf-sync] contest.standings %d failed: %v", id, err)
		return c.Status(fiber.StatusFailedDependency).JSON(fiber.Map{"error": "Gagal mengambil problem contest: " + err.Error()})
	}

	now := time.Now()
	rows := make([]model.Problem, 0, len(problems))
	for _, p := range problems {
		if p.ContestID == 0 {
			p.ContestID = id
		}
		tags, _ := json.Marshal(p.Tags)
		rows = append(rows, model.Problem{
			Provider:     "codeforces",
			ProblemID:    p.Ref(),
			Title:        p.Name,
			ProblemGroup: contest.Name,
			Difficulty:   p.Rating,
			Tags:         string(tags),
			URL:          p.URL(),
			SyncedAt:     now,
		})
	}
	if len(rows) == 0 {
		return c.JSON(fiber.Map{"contestId": id, "written": 0})
	}

	// problem_group is in the update set here (unlike the problemset sync, which
	// does not know contest names) so a problem imported earlier gains its contest.
	upsert := problemUpsert
	upsert.DoUpdates = clause.AssignmentColumns([]string{
		"title", "problem_group", "difficulty", "tags", "url", "synced_at", "updated_at",
	})
	if err := h.db.Clauses(upsert).Create(&rows).Error; err != nil {
		log.Printf("[cf-sync] contest %d problems save failed: %v", id, err)
		return c.Status(500).JSON(fiber.Map{"error": "Gagal menyimpan problem contest"})
	}

	log.Printf("[cf-sync] contest %d (%s): %d problems", id, contest.Name, len(rows))
	return c.JSON(fiber.Map{"contestId": id, "contest": contest.Name, "written": len(rows)})
}
