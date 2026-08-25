package handler

import (
	"strconv"
	"time"

	"github.com/IDika31/cphub/api/internal/repository"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

type SubmissionHandler struct {
	repo *repository.SubmissionRepository
}

func NewSubmissionHandler(repo *repository.SubmissionRepository) *SubmissionHandler {
	return &SubmissionHandler{repo: repo}
}

func paging(c *fiber.Ctx) (page, limit, offset int) {
	page, _ = strconv.Atoi(c.Query("page", "1"))
	limit, _ = strconv.Atoi(c.Query("limit", "50"))
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 200 {
		limit = 50
	}
	return page, limit, (page - 1) * limit
}

// nullableUUID renders the zero UUID as "" so the client can test truthiness
// instead of comparing against an all-zero string.
func nullableUUID(id uuid.UUID) string {
	if id == uuid.Nil {
		return ""
	}
	return id.String()
}

func (h *SubmissionHandler) ListLocal(c *fiber.Ctx) error {
	userID, _ := uuid.Parse(c.Locals("userId").(string))
	provider := c.Query("provider")
	page, limit, offset := paging(c)

	subs, total, err := h.repo.FindLocalByUser(userID, provider, limit, offset)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to fetch submissions"})
	}

	// Enrich with problem title/provider (Problem relation is json:"-").
	type localDTO struct {
		ID           string `json:"id"`
		ProblemID    string `json:"problemId"`
		ProblemTitle string `json:"problemTitle"`
		Provider     string `json:"provider"`
		ProblemRef   string `json:"problemRef"`
		Language     string `json:"language"`
		Verdict      string `json:"verdict"`
		Runtime      int    `json:"runtime"`
		Memory       int    `json:"memory"`
		PassedTests  int    `json:"passedTests"`
		TotalTests   int    `json:"totalTests"`
		ExecutedAt   string `json:"executedAt"`
	}
	data := make([]localDTO, 0, len(subs))
	for _, s := range subs {
		executed := s.CreatedAt
		if s.ExecutedAt != nil && !s.ExecutedAt.IsZero() {
			executed = *s.ExecutedAt
		}
		data = append(data, localDTO{
			ID:           s.ID.String(),
			ProblemID:    nullableUUID(s.ProblemID),
			ProblemTitle: s.ProblemTitle,
			Provider:     s.Provider,
			ProblemRef:   s.ProblemRef,
			Language:     s.Language,
			Verdict:      s.Verdict,
			Runtime:      s.Runtime,
			Memory:       s.Memory,
			PassedTests:  s.PassedTests,
			TotalTests:   s.TotalTests,
			ExecutedAt:   executed.Format(time.RFC3339),
		})
	}

	return c.JSON(fiber.Map{"data": data, "total": total, "page": page, "limit": limit})
}

func (h *SubmissionHandler) ListExternal(c *fiber.Ctx) error {
	userID, _ := uuid.Parse(c.Locals("userId").(string))
	provider := c.Query("provider")
	page, limit, offset := paging(c)

	subs, total, err := h.repo.FindExternalByUser(userID, provider, limit, offset)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to fetch submissions"})
	}

	// Emitted as a DTO rather than the model so problemId can be blanked when
	// unlinked — the table uses it to decide whether the row deep-links.
	type externalDTO struct {
		ID           string `json:"id"`
		ProblemID    string `json:"problemId"`
		Provider     string `json:"provider"`
		SubmissionID string `json:"submissionId"`
		ProblemTitle string `json:"problemTitle"`
		ProblemRef   string `json:"problemRef"`
		ProblemGroup string `json:"problemGroup,omitempty"`
		Language     string `json:"language"`
		Verdict      string `json:"verdict"`
		Score        int    `json:"score"`
		Runtime      int    `json:"runtime"`
		Memory       int    `json:"memory"`
		SubmittedAt  string `json:"submittedAt,omitempty"`
	}
	data := make([]externalDTO, 0, len(subs))
	for _, s := range subs {
		submitted := ""
		if s.SubmittedAt != nil && !s.SubmittedAt.IsZero() {
			submitted = s.SubmittedAt.Format(time.RFC3339)
		}
		data = append(data, externalDTO{
			ID:           s.ID.String(),
			ProblemID:    nullableUUID(s.ProblemID),
			Provider:     s.Provider,
			SubmissionID: s.SubmissionID,
			ProblemTitle: s.ProblemTitle,
			ProblemRef:   s.ProblemRef,
			ProblemGroup: s.ProblemGroup,
			Language:     s.Language,
			Verdict:      s.Verdict,
			Score:        s.Score,
			Runtime:      s.Runtime,
			Memory:       s.Memory,
			SubmittedAt:  submitted,
		})
	}

	return c.JSON(fiber.Map{"data": data, "total": total, "page": page, "limit": limit})
}
