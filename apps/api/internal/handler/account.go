package handler

import (
	"github.com/IDika31/cphub/api/internal/model"
	"github.com/google/uuid"
	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
)

type AccountHandler struct {
	db *gorm.DB
}

func NewAccountHandler(db *gorm.DB) *AccountHandler {
	return &AccountHandler{db: db}
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
	// Initiate Codeforces OIDC flow
	// In production, redirect to CF OAuth
	return c.JSON(fiber.Map{"message": "Redirecting to Codeforces OAuth...", "redirectUrl": "/api/auth/codeforces"})
}

func (h *AccountHandler) LinkTLX(c *fiber.Ctx) error {
	// TLX verification requires extension
	// Return HMAC token for extension to use
	return c.JSON(fiber.Map{
		"message": "Open TLX profile page and use the browser extension to verify",
	})
}
