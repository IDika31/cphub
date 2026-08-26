package handler

import (
	"log"
	"strings"
	"time"

	"github.com/IDika31/cphub/api/internal/model"
	"github.com/IDika31/cphub/api/internal/provider/tlx"
	"github.com/IDika31/cphub/api/internal/repository"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type TLXSubmitHandler struct {
	db             *gorm.DB
	problemRepo    *repository.ProblemRepository
	submissionRepo *repository.SubmissionRepository
}

func NewTLXSubmitHandler(db *gorm.DB, pr *repository.ProblemRepository, sr *repository.SubmissionRepository) *TLXSubmitHandler {
	return &TLXSubmitHandler{db: db, problemRepo: pr, submissionRepo: sr}
}

// SubmitTLX submits source code to TLX using the user's stored token, polls the
// verdict, records it as an external submission, and marks the problem solved on AC.
func (h *TLXSubmitHandler) SubmitTLX(c *fiber.Ctx) error {
	userID := c.Locals("userId").(string)
	uid, _ := uuid.Parse(userID)

	var input struct {
		ProblemID  string `json:"problemId"` // CPHub problem UUID
		SourceCode string `json:"sourceCode"`
		Language   string `json:"language"`
	}
	if err := c.BodyParser(&input); err != nil || input.ProblemID == "" || input.SourceCode == "" {
		return c.Status(400).JSON(fiber.Map{"error": "problemId, sourceCode, language wajib diisi"})
	}

	// Resolve the problem (UUID or provider problemId string).
	var problem model.Problem
	if pid, perr := uuid.Parse(input.ProblemID); perr == nil {
		if err := h.db.First(&problem, "id = ?", pid).Error; err != nil {
			return c.Status(404).JSON(fiber.Map{"error": "Problem tidak ditemukan"})
		}
	} else if err := h.db.First(&problem, "problem_id = ?", input.ProblemID).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Problem tidak ditemukan"})
	}
	if problem.Provider != "tlx" && problem.Provider != ProviderTLXCustom {
		return c.Status(400).JSON(fiber.Map{"error": "Submit ke TLX hanya untuk problem TLX"})
	}

	// Judgels is the same software everywhere, so a self-hosted problem submits
	// through the identical calls — only the API base and the stored account
	// differ, both derived from the problem's own URL.
	host, slug, alias, err := parseTLXURL(problem.URL)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "URL problem TLX tidak valid"})
	}

	var account model.LinkedAccount
	q := h.db.Where("user_id = ? AND provider = ?", uid, problem.Provider)
	if problem.Provider == ProviderTLXCustom {
		q = q.Where("handle = ?", host)
	}
	if err := q.First(&account).Error; err != nil {
		return c.Status(400).JSON(fiber.Map{
			"error": "Akun " + host + " belum dihubungkan — hubungkan di halaman Connections",
		})
	}

	client := tlx.NewClient()
	if problem.Provider == ProviderTLXCustom {
		apiHost := account.ProviderUserID
		if apiHost == "" {
			apiHost = "api." + host
		}
		client = tlx.NewClientFor(apiHost)
	}

	ps, err := client.GetProblemSetBySlug(slug, account.AccessToken)
	if err != nil {
		log.Printf("[tlx-submit] problemset lookup failed (%s): %v", slug, err)
		if tlxAuthError(err) {
			return c.Status(fiber.StatusFailedDependency).JSON(fiber.Map{"error": "Token TLX kedaluwarsa — hubungkan ulang di Connections"})
		}
		return c.Status(fiber.StatusFailedDependency).JSON(fiber.Map{"error": "Gagal mengambil data problemset TLX"})
	}

	ws, err := client.GetWorksheet(ps.JID, alias, account.AccessToken)
	if err != nil || ws.ProblemJid == "" {
		log.Printf("[tlx-submit] worksheet/problemJid failed (%s/%s): %v", ps.JID, alias, err)
		return c.Status(fiber.StatusFailedDependency).JSON(fiber.Map{"error": "Gagal mengambil problemJid TLX"})
	}

	sub, err := client.Submit(ps.JID, ws.ProblemJid, input.Language, input.SourceCode, account.AccessToken)
	if err != nil {
		log.Printf("[tlx-submit] submit failed: %v", err)
		if tlxAuthError(err) {
			return c.Status(fiber.StatusFailedDependency).JSON(fiber.Map{"error": "Token TLX kedaluwarsa — hubungkan ulang di Connections"})
		}
		return c.Status(fiber.StatusFailedDependency).JSON(fiber.Map{"error": "Gagal submit ke TLX: " + err.Error()})
	}

	// Poll verdict (TLX grades async). ~30s budget.
	verdict := "?"
	score := 0
	for i := 0; i < 30; i++ {
		time.Sleep(1 * time.Second)
		v, perr := client.GetLatestVerdict(ws.ProblemJid, account.Handle, sub.JID, account.AccessToken)
		if perr != nil {
			log.Printf("[tlx-submit] poll error: %v", perr)
			continue
		}
		if v.Code != "?" && v.Code != "" {
			verdict = v.Code
			score = v.Score
			break
		}
	}

	// Record as an external submission (idempotent per user + provider + id).
	extSub := &model.ExternalSubmission{
		UserID:       uid,
		ProblemID:    problem.ID,
		Provider:     problem.Provider,
		SubmissionID: sub.JID,
		ProblemTitle: problem.Title,
		ProblemRef:   problem.ProblemID,
		Language:     input.Language,
		Verdict:      verdict,
	}
	if err := h.submissionRepo.CreateExternal(extSub); err != nil {
		log.Printf("[tlx-submit] failed to record submission: %v", err)
	}

	// AC → mark solved.
	if verdict == "AC" && problem.Status != "solved" {
		if err := h.db.Model(&model.Problem{}).Where("id = ?", problem.ID).
			Update("status", "solved").Error; err != nil {
			log.Printf("[tlx-submit] failed to mark solved: %v", err)
		}
	}

	log.Printf("[tlx-submit] %s/%s verdict=%s score=%d (user=%s)", slug, alias, verdict, score, userID)
	return c.JSON(fiber.Map{
		"submissionJid": sub.JID,
		"verdict":       verdict,
		"score":         score,
		"pending":       verdict == "?",
		"url":           "https://tlx.toki.id/problems/" + slug + "/" + alias + "/submissions",
	})
}

func tlxAuthError(err error) bool {
	return strings.Contains(err.Error(), "HTTP 401") || strings.Contains(err.Error(), "HTTP 403")
}
