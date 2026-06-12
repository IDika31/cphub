package handler

import (
	"github.com/IDika31/cphub/api/internal/model"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type SettingsHandler struct {
	db *gorm.DB
}

func NewSettingsHandler(db *gorm.DB) *SettingsHandler {
	return &SettingsHandler{db: db}
}

func (h *SettingsHandler) Get(c *fiber.Ctx) error {
	userID := c.Locals("userId").(string)
	uid, _ := uuid.Parse(userID)

	var settings model.UserSettings
	if err := h.db.Where("user_id = ?", uid).First(&settings).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			settings = model.UserSettings{
				ID:              uuid.New(),
				UserID:          uid,
				DefaultLanguage: "cpp17",
				DefaultTheme:    "dark",
				AutoSync:        true,
				EditorFontSize:  14,
				TabSize:         4,
				Templates:       "{}",
			}
			h.db.Create(&settings)
		} else {
			return c.Status(500).JSON(fiber.Map{"error": "Failed to fetch settings"})
		}
	}

	return c.JSON(settings)
}

func (h *SettingsHandler) Update(c *fiber.Ctx) error {
	userID := c.Locals("userId").(string)
	uid, _ := uuid.Parse(userID)

	var input struct {
		DefaultLanguage string `json:"defaultLanguage"`
		DefaultTheme    string `json:"defaultTheme"`
		AutoSync        *bool  `json:"autoSync"`
		EditorFontSize  int    `json:"editorFontSize"`
		TabSize         int    `json:"tabSize"`
		Templates       string `json:"templates"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request"})
	}

	var settings model.UserSettings
	if err := h.db.Where("user_id = ?", uid).First(&settings).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			settings = model.UserSettings{ID: uuid.New(), UserID: uid}
		} else {
			return c.Status(500).JSON(fiber.Map{"error": "Failed to fetch settings"})
		}
	}

	if input.DefaultLanguage != "" {
		settings.DefaultLanguage = input.DefaultLanguage
	}
	if input.DefaultTheme != "" {
		settings.DefaultTheme = input.DefaultTheme
	}
	if input.AutoSync != nil {
		settings.AutoSync = *input.AutoSync
	}
	if input.EditorFontSize > 0 {
		settings.EditorFontSize = input.EditorFontSize
	}
	if input.TabSize > 0 {
		settings.TabSize = input.TabSize
	}
	if input.Templates != "" {
		settings.Templates = input.Templates
	}

	if err := h.db.Save(&settings).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to update settings"})
	}

	return c.JSON(settings)
}
