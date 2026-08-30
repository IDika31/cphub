package handler

import (
	"log"
	"strings"
	"time"

	"github.com/IDika31/cphub/api/internal/model"
	"github.com/IDika31/cphub/api/internal/repository"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// ProblemAttemptsHandler serves one problem's own run history, code and all.
//
// The code was always stored — local_submissions.source_code — and never readable
// anywhere: the Submissions page lists runs without it, so the one question a solved
// problem raises ("what did I change between the WA and the AC?") had no answer in the
// app that held both versions.
type ProblemAttemptsHandler struct {
	db   *gorm.DB
	repo *repository.SubmissionRepository
}

func NewProblemAttemptsHandler(db *gorm.DB, repo *repository.SubmissionRepository) *ProblemAttemptsHandler {
	return &ProblemAttemptsHandler{db: db, repo: repo}
}

// ListAttempts returns the newest runs for one problem. Accepts the row's UUID or the
// provider's ref ("4A"), because which one the page has depends on how the user got
// there — a link from the problemset carries one, a link from a submission the other.
func (h *ProblemAttemptsHandler) ListAttempts(c *fiber.Ctx) error {
	userID, err := uuid.Parse(c.Locals("userId").(string))
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "Unauthenticated"})
	}

	raw := strings.TrimSpace(c.Params("id"))
	problemID, parseErr := uuid.Parse(raw)
	if parseErr != nil {
		var problem model.Problem
		if dbErr := h.db.Select("id").Where("problem_id = ?", raw).First(&problem).Error; dbErr != nil {
			return c.Status(404).JSON(fiber.Map{"error": "Problem tidak ditemukan"})
		}
		problemID = problem.ID
	}

	subs, err := h.repo.FindLocalByProblem(userID, problemID, c.QueryInt("limit", 20))
	if err != nil {
		log.Printf("[attempts] listing runs for %s: %v", problemID, err)
		return c.Status(500).JSON(fiber.Map{"error": "Gagal memuat riwayat"})
	}

	// Its own DTO rather than the model: the model carries the User association and a
	// zero ExecutedAt for rows written before that column was populated, and the page
	// should not have to know either.
	type attemptDTO struct {
		ID          string `json:"id"`
		Language    string `json:"language"`
		Verdict     string `json:"verdict"`
		Runtime     int    `json:"runtime"`
		Memory      int    `json:"memory"`
		PassedTests int    `json:"passedTests"`
		TotalTests  int    `json:"totalTests"`
		SourceCode  string `json:"sourceCode"`
		ExecutedAt  string `json:"executedAt"`
	}
	data := make([]attemptDTO, 0, len(subs))
	for _, s := range subs {
		when := s.ExecutedAt
		if when.IsZero() {
			when = s.CreatedAt
		}
		data = append(data, attemptDTO{
			ID:          s.ID.String(),
			Language:    s.Language,
			Verdict:     s.Verdict,
			Runtime:     s.Runtime,
			Memory:      s.Memory,
			PassedTests: s.PassedTests,
			TotalTests:  s.TotalTests,
			SourceCode:  s.SourceCode,
			ExecutedAt:  when.UTC().Format(time.RFC3339),
		})
	}
	return c.JSON(fiber.Map{"data": data})
}
