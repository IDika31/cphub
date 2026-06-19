package handler

import (
	"log"
	"net/url"
	"time"

	"github.com/IDika31/cphub/api/internal/database"
	"github.com/IDika31/cphub/api/internal/model"
	"github.com/IDika31/cphub/api/internal/provider/tlx"
	"github.com/google/uuid"
	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
)

type AccountHandler struct {
	db             *gorm.DB
	cfClientID     string
	cfClientSecret string
	cfRedirectURL  string
}

func NewAccountHandler(db *gorm.DB, cfClientID, cfClientSecret, cfRedirectURL string) *AccountHandler {
	return &AccountHandler{
		db:             db,
		cfClientID:     cfClientID,
		cfClientSecret: cfClientSecret,
		cfRedirectURL:  cfRedirectURL,
	}
}

func (h *AccountHandler) List(c *fiber.Ctx) error {
	userID := c.Locals("userId").(string)
	uid, _ := uuid.Parse(userID)

	var accounts []model.LinkedAccount
	if err := h.db.Where("user_id = ?", uid).Find(&accounts).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to fetch accounts"})
	}

	return c.JSON(fiber.Map{"data": accounts})
}

func (h *AccountHandler) Unlink(c *fiber.Ctx) error {
	userID := c.Locals("userId").(string)
	uid, _ := uuid.Parse(userID)
	accountID := c.Params("id")

	if err := h.db.Where("id = ? AND user_id = ?", accountID, uid).Delete(&model.LinkedAccount{}).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to unlink account"})
	}

	return c.JSON(fiber.Map{"message": "Account unlinked"})
}

func (h *AccountHandler) LinkCodeforces(c *fiber.Ctx) error {
	userID := c.Locals("userId").(string)

	state := uuid.New().String()
	redisCtx := c.Context()
	_ = database.Cache.Set(redisCtx, "cf_oauth:"+state, userID, 10*time.Minute).Err()

	redirectURL := "https://codeforces.com/oauth/authorize" +
		"?response_type=code" +
		"&client_id=" + url.QueryEscape(h.cfClientID) +
		"&redirect_uri=" + url.QueryEscape(h.cfRedirectURL) +
		"&scope=openid" +
		"&state=" + url.QueryEscape(state)

	return c.JSON(fiber.Map{
		"message":     "Redirecting to Codeforces OAuth...",
		"redirectUrl": redirectURL,
	})
}

func (h *AccountHandler) LinkTLX(c *fiber.Ctx) error {
	userID := c.Locals("userId").(string)
	uid, _ := uuid.Parse(userID)

	var input struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := c.BodyParser(&input); err != nil || input.Username == "" || input.Password == "" {
		return c.Status(400).JSON(fiber.Map{"error": "username dan password wajib diisi"})
	}

	// Login to TLX API
	tlxClient := tlx.NewClient()
	loginResult, err := tlxClient.Login(input.Username, input.Password)
	if err != nil {
		log.Printf("[tlx] login failed for %s: %v", input.Username, err)
		return c.Status(401).JSON(fiber.Map{"error": err.Error()})
	}

	// Upsert linked_account (same pattern as Codeforces)
	now := time.Now()
	var account model.LinkedAccount
	result := h.db.Where("user_id = ? AND provider = ?", uid, "tlx").First(&account)
	if result.Error != nil {
		account = model.LinkedAccount{
			ID:             uuid.New(),
			UserID:         uid,
			Provider:       "tlx",
			ProviderUserID: loginResult.Username,
			Handle:         loginResult.Username,
			AccessToken:    loginResult.Token,
			IsConnected:    true,
			LinkedAt:       now,
		}
		if err := h.db.Create(&account).Error; err != nil {
			log.Printf("[tlx] failed to create linked account: %v", err)
			return c.Status(500).JSON(fiber.Map{"error": "Gagal menyimpan akun TLX"})
		}
	} else {
		account.AccessToken = loginResult.Token
		account.Handle = loginResult.Username
		account.ProviderUserID = loginResult.Username
		account.IsConnected = true
		if err := h.db.Save(&account).Error; err != nil {
			log.Printf("[tlx] failed to update linked account: %v", err)
			return c.Status(500).JSON(fiber.Map{"error": "Gagal memperbarui akun TLX"})
		}
	}

	log.Printf("[tlx] linked TLX account: %s (user=%s)", loginResult.Username, userID)
	return c.JSON(fiber.Map{"message": "Akun TLX berhasil dihubungkan", "handle": loginResult.Username})
}
