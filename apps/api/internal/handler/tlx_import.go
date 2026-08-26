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

	host, slug, alias, err := parseTLXURL(input.URL)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "URL TLX tidak valid — format: https://tlx.toki.id/problems/{slug}/{alias}"})
	}

	// The host decides which instance and which stored account to use. This used
	// to be dropped on the floor: a self-hosted URL was fetched from the official
	// TLX with the official token and saved as provider "tlx", so it either failed
	// or — when the slug happened to exist on both — silently imported the wrong
	// instance's copy under the wrong provider.
	provider := "tlx"
	displayHost := "tlx.toki.id"
	if host != "" && !strings.EqualFold(host, "tlx.toki.id") {
		provider = ProviderTLXCustom
		displayHost = host
	}

	var account model.LinkedAccount
	q := h.db.Where("user_id = ? AND provider = ?", uid, provider)
	if provider == ProviderTLXCustom {
		q = q.Where("handle = ?", host)
	}
	if err := q.First(&account).Error; err != nil {
		if provider == ProviderTLXCustom {
			return c.Status(400).JSON(fiber.Map{
				"error": "Instance " + host + " belum di-login — buka Connections dan login dulu",
			})
		}
		return c.Status(400).JSON(fiber.Map{"error": "Akun TLX belum dihubungkan — hubungkan di halaman Connections"})
	}
	if account.AccessToken == "" {
		return c.Status(400).JSON(fiber.Map{
			"error": "Belum ada token untuk " + displayHost + " — login dulu di Connections",
		})
	}

	tlxClient := tlx.NewClient()
	if provider == ProviderTLXCustom {
		// provider_user_id holds the API host the extension reported; api.<host> is
		// the Judgels convention when it is missing.
		apiHost := account.ProviderUserID
		if apiHost == "" {
			apiHost = "api." + host
		}
		tlxClient = tlx.NewClientFor(apiHost)
	}

	ps, err := tlxClient.GetProblemSetBySlug(slug, account.AccessToken)
	if err != nil {
		log.Printf("[tlx-import] GetProblemSetBySlug failed (%s): %v", slug, err)
		if strings.Contains(err.Error(), "HTTP 401") || strings.Contains(err.Error(), "HTTP 403") {
			return c.Status(fiber.StatusFailedDependency).JSON(fiber.Map{"error": "Token TLX kedaluwarsa — hubungkan ulang akun di Connections"})
		}
		return c.Status(fiber.StatusFailedDependency).JSON(fiber.Map{"error": "Gagal mengambil data problemset TLX: " + err.Error()})
	}

	ws, err := tlxClient.GetWorksheet(ps.JID, alias, account.AccessToken)
	if err != nil {
		log.Printf("[tlx-import] GetWorksheet failed (%s/%s): %v", ps.JID, alias, err)
		if strings.Contains(err.Error(), "HTTP 404") {
			return c.Status(404).JSON(fiber.Map{"error": "Problem tidak ditemukan di TLX"})
		}
		if strings.Contains(err.Error(), "HTTP 401") || strings.Contains(err.Error(), "HTTP 403") {
			return c.Status(fiber.StatusFailedDependency).JSON(fiber.Map{"error": "Token TLX kedaluwarsa — hubungkan ulang akun di Connections"})
		}
		return c.Status(fiber.StatusFailedDependency).JSON(fiber.Map{"error": "Gagal mengambil worksheet TLX: " + err.Error()})
	}

	problemID := slug + "-" + alias
	problem := &model.Problem{
		Provider:     provider,
		ProblemID:    problemID,
		Title:        ws.Title,
		Statement:    ws.Statement,
		TimeLimit:    ws.TimeLimit(),
		MemoryLimit:  ws.MemoryLimit(),
		Tags:         "[]",
		URL:          fmt.Sprintf("https://%s/problems/%s/%s", displayHost, slug, alias),
		Status:       "synced",
		ProblemGroup: ps.Name,
	}
	problem.ID = uuid.New()

	if err := h.problemRepo.Upsert(problem); err != nil {
		log.Printf("[tlx-import] upsert failed: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "Gagal menyimpan problem"})
	}

	log.Printf("[tlx-import] imported %s: %s — %q (user=%s)", displayHost, problemID, ws.Title, userID)
	return c.JSON(fiber.Map{
		"id":        problem.ID.String(),
		"problemId": problemID,
		"title":     ws.Title,
		"provider":  provider,
		"host":      displayHost,
	})
}

// parseTLXURL extracts the instance host, slug and alias from a Judgels/TLX
// problem URL. The host matters: a self-hosted instance serves the same paths as
// tlx.toki.id, so it is the only thing that says which one to talk to.
// Expected: https://{host}/problems/{slug}/{alias}
func parseTLXURL(rawURL string) (host, slug, alias string, err error) {
	u, err := url.Parse(rawURL)
	if err != nil {
		return "", "", "", fmt.Errorf("invalid URL: %w", err)
	}
	parts := strings.Split(strings.Trim(u.Path, "/"), "/")
	if len(parts) < 3 || parts[0] != "problems" || parts[1] == "" || parts[2] == "" {
		return "", "", "", fmt.Errorf("expected /problems/{slug}/{alias}, got %q", u.Path)
	}
	return strings.ToLower(u.Hostname()), parts[1], parts[2], nil
}
