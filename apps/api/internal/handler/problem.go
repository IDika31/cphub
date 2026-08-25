package handler

import (
	"log"
	"regexp"
	"strconv"
	"strings"

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
}

func NewProblemHandler(repo *repository.ProblemRepository, cfScraper *codeforces.Scraper) *ProblemHandler {
	return &ProblemHandler{repo: repo, cfScraper: cfScraper}
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
		d, _ := strconv.Atoi(diff)
		filter["difficulty"] = d
	}
	if status := c.Query("status"); status != "" {
		filter["status"] = status
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
	if userIDStr, ok := c.Locals("userId").(string); ok {
		if userID, e := uuid.Parse(userIDStr); e == nil {
			h.applyUserStatus(userID, problems)
		}
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
		// Re-scrape CF problems missing test cases or statement (e.g. imported before scraper fix)
		if problem.Provider == "codeforces" && (len(problem.TestCases) == 0 || problem.Statement == "") && h.cfScraper != nil {
			if m := cfProblemIDRe.FindStringSubmatch(problemID); m != nil {
				if p, fetchErr := h.cfScraper.FetchProblem(m[1], strings.ToUpper(m[2])); fetchErr == nil {
					if upErr := h.repo.Upsert(p); upErr != nil {
						log.Printf("[problem] re-scrape upsert failed for %s: %v", problemID, upErr)
					}
					if fresh, e := h.repo.FindByProblemID(problemID); e == nil {
						return c.JSON(fresh)
					}
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
		}
	}

	return c.Status(404).JSON(fiber.Map{"error": "Problem not found"})
}
