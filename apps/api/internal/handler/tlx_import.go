package handler

import (
	"fmt"
	"log"
	"net/url"
	"strings"

	"github.com/IDika31/cphub/api/internal/model"
	"github.com/IDika31/cphub/api/internal/provider/tlx"
	"github.com/IDika31/cphub/api/internal/repository"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type TLXImportHandler struct {
	db          *gorm.DB
	problemRepo *repository.ProblemRepository
}

func NewTLXImportHandler(db *gorm.DB, problemRepo *repository.ProblemRepository) *TLXImportHandler {
	return &TLXImportHandler{db: db, problemRepo: problemRepo}
}

func (h *TLXImportHandler) ImportTLX(c *fiber.Ctx) error {
	userID := c.Locals("userId").(string)
	uid, _ := uuid.Parse(userID)

	var input struct {
		URL string `json:"url"`
	}
	if err := c.BodyParser(&input); err != nil || input.URL == "" {
		return c.Status(400).JSON(fiber.Map{"error": "URL TLX wajib diisi"})
	}

	slug, alias, err := parseTLXURL(input.URL)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "URL TLX tidak valid — format: https://tlx.toki.id/problems/{slug}/{alias}"})
	}

	var account model.LinkedAccount
	if err := h.db.Where("user_id = ? AND provider = ?", uid, "tlx").First(&account).Error; err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Akun TLX belum dihubungkan — hubungkan di halaman Connections"})
	}

	tlxClient := tlx.NewClient()

	ps, err := tlxClient.GetProblemSetBySlug(slug, account.AccessToken)
	if err != nil {
		log.Printf("[tlx-import] GetProblemSetBySlug failed (%s): %v", slug, err)
		if strings.Contains(err.Error(), "HTTP 401") || strings.Contains(err.Error(), "HTTP 403") {
			return c.Status(502).JSON(fiber.Map{"error": "Token TLX kedaluwarsa — hubungkan ulang akun di Connections"})
		}
		return c.Status(502).JSON(fiber.Map{"error": "Gagal mengambil data problemset TLX: " + err.Error()})
	}

	ws, err := tlxClient.GetWorksheet(ps.JID, alias, account.AccessToken)
	if err != nil {
		log.Printf("[tlx-import] GetWorksheet failed (%s/%s): %v", ps.JID, alias, err)
		if strings.Contains(err.Error(), "HTTP 404") {
			return c.Status(404).JSON(fiber.Map{"error": "Problem tidak ditemukan di TLX"})
		}
		if strings.Contains(err.Error(), "HTTP 401") || strings.Contains(err.Error(), "HTTP 403") {
			return c.Status(502).JSON(fiber.Map{"error": "Token TLX kedaluwarsa — hubungkan ulang akun di Connections"})
		}
		return c.Status(502).JSON(fiber.Map{"error": "Gagal mengambil worksheet TLX: " + err.Error()})
	}

	problemID := slug + "-" + alias
	problem := &model.Problem{
		Provider:     "tlx",
		ProblemID:    problemID,
		Title:        ws.Title,
		Statement:    ws.Statement,
		TimeLimit:    ws.TimeLimit(),
		MemoryLimit:  ws.MemoryLimit(),
		Tags:         "[]",
		URL:          fmt.Sprintf("https://tlx.toki.id/problems/%s/%s", slug, alias),
		Status:       "synced",
		ProblemGroup: ps.Name,
	}
	problem.ID = uuid.New()

	if err := h.problemRepo.Upsert(problem); err != nil {
		log.Printf("[tlx-import] upsert failed: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "Gagal menyimpan problem"})
	}

	log.Printf("[tlx-import] imported: %s — %q (user=%s)", problemID, ws.Title, userID)
	return c.JSON(fiber.Map{
		"problemId": problemID,
		"title":     ws.Title,
		"provider":  "tlx",
	})
}

// parseTLXURL extracts slug and alias from a TLX problem URL.
// Expected: https://tlx.toki.id/problems/{slug}/{alias}
func parseTLXURL(rawURL string) (slug, alias string, err error) {
	u, err := url.Parse(rawURL)
	if err != nil {
		return "", "", fmt.Errorf("invalid URL: %w", err)
	}
	parts := strings.Split(strings.Trim(u.Path, "/"), "/")
	if len(parts) < 3 || parts[0] != "problems" || parts[1] == "" || parts[2] == "" {
		return "", "", fmt.Errorf("expected /problems/{slug}/{alias}, got %q", u.Path)
	}
	return parts[1], parts[2], nil
}
