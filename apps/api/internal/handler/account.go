package handler

import (
	"net/url"
	"time"

	"github.com/IDika31/cphub/api/internal/database"
	"github.com/IDika31/cphub/api/internal/model"
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
	return c.JSON(fiber.Map{
		"message": "Open TLX profile page and use the browser extension to verify",
	})
}
