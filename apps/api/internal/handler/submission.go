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

func (h *SubmissionHandler) ListLocal(c *fiber.Ctx) error {
	userID, _ := uuid.Parse(c.Locals("userId").(string))
	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "50"))

	offset := (page - 1) * limit
	subs, total, err := h.repo.FindLocalByUser(userID, limit, offset)
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
		data = append(data, localDTO{
			ID:           s.ID.String(),
			ProblemID:    s.ProblemID.String(),
			ProblemTitle: s.Problem.Title,
			Provider:     s.Problem.Provider,
			ProblemRef:   s.Problem.ProblemID,
			Language:     s.Language,
			Verdict:      s.Verdict,
			Runtime:      s.Runtime,
			Memory:       s.Memory,
			PassedTests:  s.PassedTests,
			TotalTests:   s.TotalTests,
			ExecutedAt:   s.ExecutedAt.Format(time.RFC3339),
		})
	}

	return c.JSON(fiber.Map{"data": data, "total": total, "page": page, "limit": limit})
}

func (h *SubmissionHandler) ListExternal(c *fiber.Ctx) error {
	userID, _ := uuid.Parse(c.Locals("userId").(string))
	provider := c.Query("provider")
	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "50"))

	offset := (page - 1) * limit
	subs, total, err := h.repo.FindExternalByUser(userID, provider, limit, offset)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to fetch submissions"})
	}

	return c.JSON(fiber.Map{"data": subs, "total": total, "page": page, "limit": limit})
}
