package handler

import (
	"encoding/json"
	"fmt"
	"log"
	"strconv"
	"sync"
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

// storeProblemset writes the metadata rows. Shared by the endpoint and by the startup
// refresher, because two copies of a batched upsert is two places for the batch size and
// the conflict clause to drift apart.
func (h *CFSyncHandler) storeProblemset(problems []codeforces.APIProblem) (written int, err error) {
	now := time.Now()
	rows := make([]model.Problem, 0, len(problems))
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
	// Five hundred at a time: one statement for ten thousand rows is a statement Postgres
	// has to plan and hold in memory all at once, on a box with 892 MB.
	for start := 0; start < len(rows); start += 500 {
		end := start + 500
		if end > len(rows) {
			end = len(rows)
		}
		batch := rows[start:end]
		if bErr := h.db.Clauses(problemUpsert).Create(&batch).Error; bErr != nil {
			return written, fmt.Errorf("problemset batch %d: %w", start, bErr)
		}
		written += len(batch)
	}
	return written, nil
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

	written, err := h.storeProblemset(problems)
	if err != nil {
		log.Printf("[cf-sync] problemset store failed: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "Gagal menyimpan problemset", "written": written})
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
//
// Kept as an endpoint for a deliberate refresh (and for anything scheduled), but the
// contest list no longer needs anyone to press a button: ListContests refreshes
// itself when what it holds has gone stale.
func (h *CFSyncHandler) SyncContests(c *fiber.Ctx) error {
	started := time.Now()
	fetched, written, err := h.refreshContests(c.QueryBool("gym", false))
	if err != nil {
		log.Printf("[cf-sync] contest.list failed: %v", err)
		return c.Status(fiber.StatusFailedDependency).JSON(fiber.Map{"error": "Gagal mengambil daftar contest: " + err.Error()})
	}
	log.Printf("[cf-sync] contests: %d fetched, %d written in %s", fetched, written, time.Since(started).Round(time.Millisecond))
	return c.JSON(fiber.Map{"fetched": fetched, "written": written, "elapsed": time.Since(started).Round(time.Millisecond).String()})
}

// problemsetFreshness is how old the stored Codeforces problemset may be before it is
// refetched. Seven days because what changes in it is slow — a new round adds a handful
// of problems and ratings settle over weeks — while the fetch itself is ten thousand rows,
// far too heavy to hang off a page open the way the contest list does.
const problemsetFreshness = 7 * 24 * time.Hour

var problemsetRefresh struct {
	mu      sync.Mutex
	lastTry time.Time
}

// EnsureProblemsetFresh imports the problemset when there is none, or when what is stored
// has aged out. Called from a ticker at startup rather than from a request: nothing a user
// does should wait on ten thousand rows, and the only manual trigger this ever had was a
// button whose right moment nobody could know.
//
// Errors are logged and swallowed. A stale problemset still serves the Problemset page and
// the recommender; a failed refresh must not turn into a failed anything else.
func (h *CFSyncHandler) EnsureProblemsetFresh() {
	problemsetRefresh.mu.Lock()
	if time.Since(problemsetRefresh.lastTry) < problemsetFreshness {
		problemsetRefresh.mu.Unlock()
		return
	}
	problemsetRefresh.lastTry = time.Now()
	problemsetRefresh.mu.Unlock()

	var newest *time.Time
	var count int64
	if err := h.db.Model(&model.Problem{}).Where("provider = ?", "codeforces").
		Select("MAX(synced_at)").Scan(&newest).Error; err != nil {
		log.Printf("[cf-sync] could not read problemset freshness: %v", err)
		return
	}
	if err := h.db.Model(&model.Problem{}).Where("provider = ?", "codeforces").
		Count(&count).Error; err != nil {
		log.Printf("[cf-sync] could not count the problemset: %v", err)
		return
	}
	if count > 0 && newest != nil && time.Since(*newest) < problemsetFreshness {
		return
	}

	started := time.Now()
	problems, _, err := h.api.ProblemsetProblems("")
	if err != nil {
		log.Printf("[cf-sync] problemset auto-import failed: %v", err)
		return
	}
	written, err := h.storeProblemset(problems)
	if err != nil {
		log.Printf("[cf-sync] problemset auto-import could not be stored: %v", err)
		return
	}
	log.Printf("[cf-sync] problemset auto-imported: %d fetched, %d written in %s",
		len(problems), written, time.Since(started).Round(time.Millisecond))
}

// contestFreshness is how old the stored contest list may be before a read
// refreshes it. Fifteen minutes because the thing that actually moves is the phase
// of a round about to start, and contest.list is one unauthenticated API call —
// cheap enough to pay on a page open, far too expensive to pay on every one.
const contestFreshness = 15 * time.Minute

// contestRefresh serialises the self-refresh and remembers when it last ran, so a
// page opened in three tabs at once makes one API call and not three. The attempt is
// stamped whether it succeeds or fails: a Codeforces outage must not turn every
// contest-list read into another timeout.
var contestRefresh struct {
	mu       sync.Mutex
	lastTry  time.Time
	inFlight bool
}

// refreshIfStale brings the stored contest list up to date when it has aged out.
// Errors are logged and swallowed on purpose — the caller's job is to answer with
// the contests it has, and a stale list is a better answer than a 502.
func (h *CFSyncHandler) refreshIfStale() {
	var newest *time.Time
	if err := h.db.Model(&model.Contest{}).
		Where("provider = ?", "codeforces").
		Select("MAX(synced_at)").
		Scan(&newest).Error; err != nil {
		log.Printf("[cf-sync] could not read contest freshness: %v", err)
		return
	}
	if newest != nil && time.Since(*newest) < contestFreshness {
		return
	}

	contestRefresh.mu.Lock()
	if contestRefresh.inFlight || time.Since(contestRefresh.lastTry) < contestFreshness {
		contestRefresh.mu.Unlock()
		return
	}
	contestRefresh.inFlight = true
	contestRefresh.lastTry = time.Now()
	contestRefresh.mu.Unlock()
	defer func() {
		contestRefresh.mu.Lock()
		contestRefresh.inFlight = false
		contestRefresh.mu.Unlock()
	}()

	started := time.Now()
	fetched, written, err := h.refreshContests(false)
	if err != nil {
		log.Printf("[cf-sync] auto-refresh failed, serving what is stored: %v", err)
		return
	}
	log.Printf("[cf-sync] contests auto-refreshed: %d fetched, %d written in %s",
		fetched, written, time.Since(started).Round(time.Millisecond))
}

// refreshContests is the sync itself, without an HTTP request attached, so both the
// endpoint and the staleness check above can run it.
func (h *CFSyncHandler) refreshContests(gym bool) (fetched, written int, err error) {
	list, err := h.api.ContestList(gym)
	if err != nil {
		return 0, 0, err
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
	for start := 0; start < len(rows); start += 500 {
		end := start + 500
		if end > len(rows) {
			end = len(rows)
		}
		batch := rows[start:end]
		if wErr := h.db.Clauses(upsert).Create(&batch).Error; wErr != nil {
			return len(list), written, fmt.Errorf("writing contest batch %d: %w", start, wErr)
		}
		written += len(batch)
	}
	return len(list), written, nil
}

// ListContests reads what was synced. `phase=BEFORE` is the upcoming set;
// `upcoming=true` is the same thing expressed as a time filter, for contests whose
// phase has not been refreshed recently.
func (h *CFSyncHandler) ListContests(c *fiber.Ctx) error {
	// Opening the page is the trigger; there is no Sync button any more. Inline
	// rather than in a goroutine so the reply already carries the fresh phases —
	// contest.list answers in well under a second, and refreshIfStale returns
	// immediately when the list is young or another request is already refreshing.
	h.refreshIfStale()

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
