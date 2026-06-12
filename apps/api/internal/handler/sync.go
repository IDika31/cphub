package handler

import (
	"encoding/json"
	"log"
	"strings"

	"github.com/IDika31/cphub/api/internal/model"
	"github.com/IDika31/cphub/api/internal/repository"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

type SyncHandler struct {
	problemRepo *repository.ProblemRepository
	submissionRepo *repository.SubmissionRepository
}

func NewSyncHandler(pr *repository.ProblemRepository, sr *repository.SubmissionRepository) *SyncHandler {
	return &SyncHandler{problemRepo: pr, submissionRepo: sr}
}

type SyncProblemPayload struct {
	Provider  string `json:"provider"`
	ProblemID string `json:"problemId"`
	Title     string `json:"title"`
	Statement string `json:"statement"`
	InputSpec string `json:"inputSpec"`
	OutputSpec string `json:"outputSpec"`
	Difficulty int    `json:"difficulty"`
	TimeLimit   string `json:"timeLimit"`
	MemoryLimit string `json:"memoryLimit"`
	Tags        string `json:"tags"`
	URL         string `json:"url"`
		Note       string `json:"note"`
	TestCases   []SyncTestCase `json:"testCases"`
}

type SyncTestCase struct {
	Input    string `json:"input"`
	Output   string `json:"output"`
	IsSample bool   `json:"isSample"`
}

func (h *SyncHandler) SyncProblem(c *fiber.Ctx) error {
	var payload SyncProblemPayload
	if err := c.BodyParser(&payload); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request body"})
	}

	if payload.Provider == "" || payload.ProblemID == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Provider and problemId required"})
	}

	// Normalize tags to JSON
	if payload.Tags == "" {
		payload.Tags = "[]"
	}
	if !strings.HasPrefix(payload.Tags, "[") {
		tagList := strings.Split(payload.Tags, ",")
		for i := range tagList {
			tagList[i] = strings.TrimSpace(tagList[i])
		}
		b, _ := json.Marshal(tagList)
		payload.Tags = string(b)
	}

	problem := &model.Problem{
		Provider:    payload.Provider,
		ProblemID:   payload.ProblemID,
		Title:       payload.Title,
		Statement:   payload.Statement,
		InputSpec:   payload.InputSpec,
		OutputSpec:  payload.OutputSpec,
		Difficulty:  payload.Difficulty,
		TimeLimit:   payload.TimeLimit,
		MemoryLimit: payload.MemoryLimit,
		Tags:        payload.Tags,
		URL:         payload.URL,
		Status:      "synced",
			Note:       payload.Note,
	}

	// Set ID for new problems
	problem.ID = uuid.New()

	// Add test cases
	for _, tc := range payload.TestCases {
		problem.TestCases = append(problem.TestCases, model.TestCase{
			ID:       uuid.New(),
			ProblemID: problem.ID,
			Input:    tc.Input,
			Output:   tc.Output,
			IsSample: tc.IsSample,
		})
	}

	if err := h.problemRepo.Upsert(problem); err != nil {
		log.Printf("[sync] failed to upsert problem: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "Failed to save problem"})
	}

	log.Printf("[sync] synced problem: %s/%s - %s", payload.Provider, payload.ProblemID, payload.Title)
	return c.JSON(fiber.Map{
		"status":  "ok",
		"message": "Problem synced successfully",
		"problemId": problem.ProblemID,
	})
}

type SyncSubmissionPayload struct {
	Provider     string `json:"provider"`
	SubmissionID string `json:"submissionId"`
	ProblemTitle string `json:"problemTitle"`
	ProblemRef   string `json:"problemRef"`
	Language     string `json:"language"`
	Verdict      string `json:"verdict"`
	Runtime      int    `json:"runtime"`
	Memory       int    `json:"memory"`
}

func (h *SyncHandler) SyncSubmission(c *fiber.Ctx) error {
	var payload SyncSubmissionPayload
	if err := c.BodyParser(&payload); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request body"})
	}

	sub := &model.ExternalSubmission{
		Provider:     payload.Provider,
		SubmissionID: payload.SubmissionID,
		ProblemTitle: payload.ProblemTitle,
		ProblemRef:   payload.ProblemRef,
		Language:     payload.Language,
		Verdict:      payload.Verdict,
		Runtime:      payload.Runtime,
		Memory:       payload.Memory,
	}

	if err := h.submissionRepo.CreateExternal(sub); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to save submission"})
	}

	return c.JSON(fiber.Map{"status": "ok", "message": "Submission synced"})
}
