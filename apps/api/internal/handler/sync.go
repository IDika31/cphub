package handler

import (
	"encoding/json"
	"log"
	"strings"
	"time"

	"github.com/IDika31/cphub/api/internal/model"
	"github.com/IDika31/cphub/api/internal/repository"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type SyncHandler struct {
	problemRepo    *repository.ProblemRepository
	submissionRepo *repository.SubmissionRepository
	db             *gorm.DB
}

func NewSyncHandler(pr *repository.ProblemRepository, sr *repository.SubmissionRepository, db *gorm.DB) *SyncHandler {
	return &SyncHandler{problemRepo: pr, submissionRepo: sr, db: db}
}

type SyncProblemPayload struct {
	Provider     string         `json:"provider"`
	ProblemID    string         `json:"problemId"`
	Title        string         `json:"title"`
	Statement    string         `json:"statement"`
	InputSpec    string         `json:"inputSpec"`
	OutputSpec   string         `json:"outputSpec"`
	Difficulty   int            `json:"difficulty"`
	TimeLimit    string         `json:"timeLimit"`
	MemoryLimit  string         `json:"memoryLimit"`
	Tags         string         `json:"tags"`
	URL          string         `json:"url"`
	Note         string         `json:"note"`
	ProblemGroup string         `json:"problemGroup"`
	TestCases    []SyncTestCase `json:"testCases"`
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
		Provider:     payload.Provider,
		ProblemID:    payload.ProblemID,
		Title:        payload.Title,
		Statement:    payload.Statement,
		InputSpec:    payload.InputSpec,
		OutputSpec:   payload.OutputSpec,
		Difficulty:   payload.Difficulty,
		TimeLimit:    payload.TimeLimit,
		MemoryLimit:  payload.MemoryLimit,
		Tags:         payload.Tags,
		URL:          payload.URL,
		Status:       "synced",
		Note:         payload.Note,
		ProblemGroup: payload.ProblemGroup,
	}

	// Set ID for new problems
	problem.ID = uuid.New()

	// Add test cases
	for _, tc := range payload.TestCases {
		problem.TestCases = append(problem.TestCases, model.TestCase{
			ID:        uuid.New(),
			ProblemID: problem.ID,
			Input:     tc.Input,
			Output:    tc.Output,
			IsSample:  tc.IsSample,
		})
	}

	if err := h.problemRepo.Upsert(problem); err != nil {
		log.Printf("[sync] failed to upsert problem: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "Failed to save problem"})
	}

	log.Printf("[sync] synced problem: %s/%s - %s", payload.Provider, payload.ProblemID, payload.Title)
	return c.JSON(fiber.Map{
		"status":    "ok",
		"message":   "Problem synced successfully",
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
	SubmittedAt  int64  `json:"submittedAt"` // unix seconds, optional
}

func (h *SyncHandler) SyncSubmission(c *fiber.Ctx) error {
	var payload SyncSubmissionPayload
	if err := c.BodyParser(&payload); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request body"})
	}

	// The HMAC middleware resolves the signing key to an account. Without
	// stamping it here every extension-synced submission landed with a zero
	// user_id, and the Submissions page filters on user_id — so they were saved
	// and then never shown to anybody.
	userIDStr, _ := c.Locals("userId").(string)
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "Unauthenticated sync"})
	}

	if payload.Provider == "" || payload.SubmissionID == "" {
		return c.Status(400).JSON(fiber.Map{"error": "provider and submissionId required"})
	}

	submittedAt := time.Now()
	if payload.SubmittedAt > 0 {
		submittedAt = time.Unix(payload.SubmittedAt, 0)
	}

	sub := &model.ExternalSubmission{
		UserID:       userID,
		Provider:     payload.Provider,
		SubmissionID: payload.SubmissionID,
		ProblemTitle: payload.ProblemTitle,
		ProblemRef:   payload.ProblemRef,
		Language:     payload.Language,
		Verdict:      payload.Verdict,
		Runtime:      payload.Runtime,
		Memory:       payload.Memory,
		SubmittedAt:  &submittedAt,
	}

	// Link to the local problem row when we have it, so the Submissions table can
	// deep-link into the editor instead of rendering dead text.
	if payload.ProblemRef != "" {
		if p, e := h.problemRepo.FindByProviderAndID(payload.Provider, payload.ProblemRef); e == nil {
			sub.ProblemID = p.ID
		}
	}

	if err := h.submissionRepo.CreateExternal(sub); err != nil {
		log.Printf("[sync] failed to save submission %s/%s: %v", payload.Provider, payload.SubmissionID, err)
		return c.Status(500).JSON(fiber.Map{"error": "Failed to save submission"})
	}

	return c.JSON(fiber.Map{"status": "ok", "message": "Submission synced"})
}

// ProviderTLXCustom marks a self-hosted Judgels/TLX instance the user added in
// the extension. Kept distinct from "tlx" (the official tlx.toki.id) so the two
// are never conflated in Connections, the dashboard, or provider filters.
const ProviderTLXCustom = "tlx-custom"

type tlxHost struct {
	Host    string `json:"host"`
	APIHost string `json:"apiHost"`
	// Name is what the user called this instance in the extension. Optional; the
	// UI falls back to tlx-<host> without it.
	Name string `json:"name"`
}

type SyncTLXHostsPayload struct {
	Hosts []tlxHost `json:"hosts"`
}

// SyncTLXHosts mirrors the extension's custom-TLX list into linked_accounts, so
// every host added there shows up in Connections on its own without the user
// having to register it twice. The reported list is authoritative: hosts removed
// in the extension are unlinked here.
func (h *SyncHandler) SyncTLXHosts(c *fiber.Ctx) error {
	var payload SyncTLXHostsPayload
	if err := c.BodyParser(&payload); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request body"})
	}

	userIDStr, _ := c.Locals("userId").(string)
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "Unauthenticated sync"})
	}

	seen := make([]string, 0, len(payload.Hosts))
	for _, hst := range payload.Hosts {
		host := strings.ToLower(strings.TrimSpace(hst.Host))
		// Reject anything that is not a bare hostname: this value ends up in
		// generated URLs and provider filters.
		if host == "" || strings.ContainsAny(host, "/:? &") {
			continue
		}
		if host == "tlx.toki.id" {
			continue // the official instance is its own provider
		}
		seen = append(seen, host)

		account := model.LinkedAccount{
			UserID:         userID,
			Provider:       ProviderTLXCustom,
			Handle:         host,
			ProviderUserID: strings.TrimSpace(hst.APIHost),
			DisplayName:    strings.TrimSpace(hst.Name),
			IsConnected:    true,
			LinkedAt:       time.Now(),
		}
		// Assigned as a map, not a struct: renaming an instance to "" in the
		// extension has to clear the label, and GORM skips zero values in a struct.
		if err := h.db.Where("user_id = ? AND provider = ? AND handle = ?", userID, ProviderTLXCustom, host).
			Assign(map[string]interface{}{
				"provider_user_id": account.ProviderUserID,
				"display_name":     account.DisplayName,
				"is_connected":     true,
			}).
			FirstOrCreate(&account).Error; err != nil {
			log.Printf("[sync] could not link custom TLX host %s: %v", host, err)
			return c.Status(500).JSON(fiber.Map{"error": "Failed to save custom TLX hosts"})
		}
	}

	// Drop hosts the extension no longer reports.
	del := h.db.Where("user_id = ? AND provider = ?", userID, ProviderTLXCustom)
	if len(seen) > 0 {
		del = del.Where("handle NOT IN ?", seen)
	}
	if err := del.Delete(&model.LinkedAccount{}).Error; err != nil {
		log.Printf("[sync] could not prune custom TLX hosts: %v", err)
	}

	log.Printf("[sync] custom TLX hosts for %s: %v", userID, seen)
	return c.JSON(fiber.Map{"status": "ok", "hosts": seen})
}
