package handler

import (
	"encoding/json"
	"log"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/IDika31/cphub/api/internal/model"
	"github.com/IDika31/cphub/api/internal/provider/codeforces"
	"github.com/IDika31/cphub/api/internal/repository"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

var cfProblemIDRe = regexp.MustCompile(`^(\d+)([A-Za-z]\d*)$`)

type ProblemHandler struct {
	repo      *repository.ProblemRepository
	cfScraper *codeforces.Scraper
	// cfAPI is the fallback when scraping is refused. Codeforces put every HTML
	// page behind a Cloudflare challenge, so FetchProblem now returns 403 from a
	// server and lazy-import used to answer 404 — the problem simply could not be
	// opened. The API still serves metadata, which is enough to create the row and
	// let the extension fill in the statement later.
	cfAPI *codeforces.API
	// rescrapes remembers when a statement-less problem was last re-fetched.
	// A refused fetch writes nothing, so the row itself keeps no trace of the
	// attempt — without this marker every open of a problemset-synced problem
	// paid another Cloudflare timeout, forever.
	rescrapes struct {
		mu sync.Mutex
		at map[string]time.Time
	}
}

func NewProblemHandler(repo *repository.ProblemRepository, cfScraper *codeforces.Scraper, cfAPI *codeforces.API) *ProblemHandler {
	return &ProblemHandler{repo: repo, cfScraper: cfScraper, cfAPI: cfAPI}
}

// cfRescrapeCooldown caps how often one problem may be re-fetched from
// Codeforces. It is wall-clock and not the row's UpdatedAt on purpose: a fetch
// that dies on the Cloudflare wall never touches the row, so a timestamp gate
// would go quiet for six hours and then resume scraping on every open.
const cfRescrapeCooldown = 6 * time.Hour

// dueForRescrape reports whether ref may be re-fetched now, stamping the attempt
// when it says yes — so the cooldown holds whether the fetch succeeds or is
// refused. In-process is enough here: one API process per deploy, and a restart
// costs at most one extra fetch per problem.
func (h *ProblemHandler) dueForRescrape(ref string) bool {
	h.rescrapes.mu.Lock()
	defer h.rescrapes.mu.Unlock()
	if last, ok := h.rescrapes.at[ref]; ok && time.Since(last) < cfRescrapeCooldown {
		return false
	}
	if h.rescrapes.at == nil {
		h.rescrapes.at = make(map[string]time.Time)
	}
	h.rescrapes.at[ref] = time.Now()
	return true
}

func (h *ProblemHandler) List(c *fiber.Ctx) error {
	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "50"))
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 200 {
		limit = 50
	}
	offset := (page - 1) * limit

	filter := make(map[string]interface{})
	if provider := c.Query("provider"); provider != "" {
		filter["provider"] = provider
	}
	if tag := c.Query("tag"); tag != "" {
		filter["tag"] = tag
	}
	if diff := c.Query("difficulty"); diff != "" {
		// Swallowing this error turned ?difficulty=1500-1700 into difficulty = 0,
		// i.e. a 200 listing only the unrated problems. 0 stays a valid value — it
		// is exactly what "unrated" is stored as — but nothing can match a
		// negative, so say so instead of answering with the wrong set.
		d, convErr := strconv.Atoi(diff)
		if convErr != nil || d < 0 {
			return c.Status(400).JSON(fiber.Map{"error": "difficulty must be a non-negative integer"})
		}
		filter["difficulty"] = d
	}
	// The viewer, resolved once: the status filter is answered from this user's own
	// submissions (see ProblemRepository.FindAll) and the rendered badges are
	// overlaid from the same history further down, so both halves of the listing now
	// agree instead of one reading a shared column.
	var viewer uuid.UUID
	if raw, ok := c.Locals("userId").(string); ok {
		if parsed, e := uuid.Parse(raw); e == nil {
			viewer = parsed
			filter["userId"] = parsed
		}
	}
	if status := c.Query("status"); status != "" {
		if viewer == uuid.Nil {
			return c.Status(401).JSON(fiber.Map{"error": "Unauthenticated"})
		}
		switch status {
		case "solved", "attempted", "unsolved":
			filter["status"] = status
		default:
			return c.Status(400).JSON(fiber.Map{"error": "status must be solved, attempted or unsolved"})
		}
	}
	if q := c.Query("q"); q != "" {
		filter["q"] = q
	}

	problems, total, err := h.repo.FindAll(filter, limit, offset)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to fetch problems"})
	}

	// problems.status is a shared column on a shared library, so it said "synced"
	// for everyone and the Status column could never show a solve. Overlay the
	// caller's own outcome instead — the response is per-request, nothing is
	// written back.
	if viewer != uuid.Nil {
		h.applyUserStatus(viewer, problems)
	}

	return c.JSON(fiber.Map{
		"data":  problems,
		"total": total,
		"page":  page,
		"limit": limit,
	})
}

// applyUserStatus rewrites Status to solved / attempted / synced from the
// caller's submissions, in one query for the whole page.
func (h *ProblemHandler) applyUserStatus(userID uuid.UUID, problems []model.Problem) {
	if len(problems) == 0 {
		return
	}
	ids := make([]uuid.UUID, 0, len(problems))
	refs := make([]string, 0, len(problems))
	for _, p := range problems {
		ids = append(ids, p.ID)
		refs = append(refs, p.ProblemID)
	}

	solved, attempted, err := h.repo.UserProblemStatus(userID, ids, refs)
	if err != nil {
		return
	}
	for i := range problems {
		key := problems[i].Provider + "/" + problems[i].ProblemID
		switch {
		case solved[key] || solved[problems[i].ID.String()]:
			problems[i].Status = "solved"
		case attempted[key] || attempted[problems[i].ID.String()]:
			problems[i].Status = "attempted"
		case problems[i].Status == "solved":
			// The column is shared, and both the local grader and the TLX submit
			// path write "solved" into it — so somebody else's AC was rendered as
			// the caller's own. The caller has no submission on this row, so it is
			// not solved for them.
			problems[i].Status = "unsolved"
		}
	}
}

func (h *ProblemHandler) GetByID(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid problem ID"})
	}

	problem, err := h.repo.FindByID(id)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Problem not found"})
	}

	return c.JSON(problem)
}

func (h *ProblemHandler) Search(c *fiber.Ctx) error {
	query := c.Query("q")
	if query == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Query required"})
	}

	problems, err := h.repo.Search(query, 20)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Search failed"})
	}

	return c.JSON(fiber.Map{"data": problems, "total": len(problems)})
}

func (h *ProblemHandler) GetByProviderAndID(c *fiber.Ctx) error {
	provider := c.Params("provider")
	problemID := c.Params("problemId")
	if provider == "" || problemID == "" {
		return c.Status(400).JSON(fiber.Map{"error": "provider and problemId required"})
	}

	problem, err := h.repo.FindByProviderAndID(provider, problemID)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Problem not found"})
	}

	return c.JSON(problem)
}

func (h *ProblemHandler) GetByProblemID(c *fiber.Ctx) error {
	problemID := c.Params("problemId")
	if problemID == "" {
		return c.Status(400).JSON(fiber.Map{"error": "problemId required"})
	}

	problem, err := h.repo.FindByProblemID(problemID)
	if err == nil {
		// Re-scrape CF problems whose statement never arrived — POST
		// /api/cf/problemset/sync imports ~10k rows with rating and tags only.
		// Missing samples is deliberately not a trigger any more: an interactive
		// problem, or one whose samples block the extractor misses, stays
		// sample-less after a fully successful scrape, so testing for that re-armed
		// the fetch on every single open of the same problem.
		if problem.Provider == "codeforces" && problem.Statement == "" && h.cfScraper != nil {
			if m := cfProblemIDRe.FindStringSubmatch(problemID); m != nil && h.dueForRescrape(problem.ProblemID) {
				if p, fetchErr := h.cfScraper.FetchProblem(m[1], strings.ToUpper(m[2])); fetchErr == nil {
					if upErr := h.repo.Upsert(p); upErr != nil {
						log.Printf("[problem] re-scrape upsert failed for %s: %v", problemID, upErr)
					}
					if fresh, e := h.repo.FindByProblemID(problemID); e == nil {
						return c.JSON(fresh)
					}
				} else {
					// Dropping this error is what made a Cloudflare wall look like a
					// merely slow page: the request took its full timeout and the log
					// only showed the latency.
					log.Printf("[problem] re-scrape failed for %s: %v", problemID, fetchErr)
				}
			}
		}
		return c.JSON(problem)
	}

	// Lazy-import: auto-scrape CF problem if not in DB
	if h.cfScraper != nil {
		if m := cfProblemIDRe.FindStringSubmatch(problemID); m != nil {
			contestID := m[1]
			letter := strings.ToUpper(m[2])
			p, fetchErr := h.cfScraper.FetchProblem(contestID, letter)
			if fetchErr == nil {
				// Swallowing this error is what hid a missing column for days: the
				// editor rendered the scraped problem straight from memory while
				// every write failed, so the Problemset stayed empty.
				if upErr := h.repo.Upsert(p); upErr != nil {
					log.Printf("[problem] lazy-import upsert failed for %s: %v", problemID, upErr)
				}
				if fresh, e := h.repo.FindByProblemID(p.ProblemID); e == nil {
					return c.JSON(fresh)
				}
				return c.JSON(p)
			}
			log.Printf("[problem] lazy-import scrape failed for %s: %v", problemID, fetchErr)
			// Scraping is blocked, not broken: fall back to API metadata so the
			// problem is at least openable.
			if p := h.cfMetadata(contestID, letter); p != nil {
				if upErr := h.repo.Upsert(p); upErr != nil {
					log.Printf("[problem] metadata upsert failed for %s: %v", problemID, upErr)
				}
				if fresh, e := h.repo.FindByProblemID(p.ProblemID); e == nil {
					return c.JSON(fresh)
				}
				return c.JSON(p)
			}
		}
	}

	return c.Status(404).JSON(fiber.Map{"error": "Problem not found"})
}

// cfMetadata builds a statement-less problem from the official API. Returns nil
// when the API cannot supply it either, so the caller still answers 404 rather
// than inventing a row.
//
// ponytail: one contest.standings call per missed problem, and Codeforces only
// serves that method with no extra parameters — meaning the whole ranklist travels
// to hand back a dozen problems. Fine because it happens once per problem ever;
// if it starts to hurt, import the problemset once (POST /api/cf/problemset/sync)
// and this path stops being reached.
func (h *ProblemHandler) cfMetadata(contestID, letter string) *model.Problem {
	if h.cfAPI == nil {
		return nil
	}
	id, err := strconv.Atoi(contestID)
	if err != nil {
		return nil
	}
	problems, contest, err := h.cfAPI.ContestProblems(id)
	if err != nil {
		log.Printf("[problem] cf api metadata for %s%s failed: %v", contestID, letter, err)
		return nil
	}
	for _, p := range problems {
		if !strings.EqualFold(p.Index, letter) {
			continue
		}
		tags, _ := json.Marshal(p.Tags)
		group := ""
		if contest != nil {
			group = contest.Name
		}
		log.Printf("[problem] %s%s created from API metadata — statement needs the extension (CF HTML is behind Cloudflare)", contestID, letter)
		return &model.Problem{
			Provider:     "codeforces",
			ProblemID:    p.Ref(),
			Title:        p.Name,
			ProblemGroup: group,
			Difficulty:   p.Rating,
			Tags:         string(tags),
			URL:          p.URL(),
			SyncedAt:     time.Now(),
		}
	}
	return nil
}
