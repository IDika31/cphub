package handler

import (
	"github.com/IDika31/cphub/api/internal/model"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type ExtensionKeyHandler struct {
	db *gorm.DB
}

func NewExtensionKeyHandler(db *gorm.DB) *ExtensionKeyHandler {
	return &ExtensionKeyHandler{db: db}
}

// Get returns the caller's extension key. Every account has its own, so a key
// pasted into one browser cannot sign traffic for another account.
func (h *ExtensionKeyHandler) Get(c *fiber.Ctx) error {
	user, err := h.load(c)
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "Unauthorized"})
	}
	return c.JSON(keyResponse(user))
}

// Rotate replaces the key. Any extension still holding the old one stops syncing
// until it is re-paired.
func (h *ExtensionKeyHandler) Rotate(c *fiber.Ctx) error {
	user, err := h.load(c)
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "Unauthorized"})
	}
	user.ExtensionSecret = model.NewExtensionSecret()
	if err := h.db.Model(&model.User{}).Where("id = ?", user.ID).
		Update("extension_secret", user.ExtensionSecret).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to rotate extension key"})
	}
	return c.JSON(keyResponse(user))
}

// load resolves the JWT subject and provisions a key for accounts that predate
// per-account keys.
func (h *ExtensionKeyHandler) load(c *fiber.Ctx) (*model.User, error) {
	userIDStr, _ := c.Locals("userId").(string)
	uid, err := uuid.Parse(userIDStr)
	if err != nil {
		return nil, err
	}

	var user model.User
	if err := h.db.First(&user, "id = ?", uid).Error; err != nil {
		return nil, err
	}

	if user.ExtensionSecret == "" {
		user.ExtensionSecret = model.NewExtensionSecret()
		if err := h.db.Model(&model.User{}).Where("id = ?", user.ID).
			Update("extension_secret", user.ExtensionSecret).Error; err != nil {
			return nil, err
		}
	}
	return &user, nil
}

// keyResponse ships the two parts plus the single string the user pastes into
// the extension, so pairing is one copy instead of two.
func keyResponse(u *model.User) fiber.Map {
	return fiber.Map{
		"keyId":        u.ID.String(),
		"secret":       u.ExtensionSecret,
		"pairingToken": u.ID.String() + "." + u.ExtensionSecret,
	}
}
