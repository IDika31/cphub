package handler

import (
	"github.com/IDika31/cphub/api/internal/model"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type SnippetHandler struct {
	db *gorm.DB
}

func NewSnippetHandler(db *gorm.DB) *SnippetHandler {
	return &SnippetHandler{db: db}
}

func (h *SnippetHandler) List(c *fiber.Ctx) error {
	userID := c.Locals("userId").(string)
	uid, _ := uuid.Parse(userID)

	var snippets []model.Snippet
	if err := h.db.Where("user_id = ?", uid).Order("created_at DESC").Find(&snippets).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to fetch snippets"})
	}
	return c.JSON(fiber.Map{"data": snippets})
}

func (h *SnippetHandler) Create(c *fiber.Ctx) error {
	userID := c.Locals("userId").(string)
	uid, _ := uuid.Parse(userID)

	var input struct {
		Title       string `json:"title"`
		Language    string `json:"language"`
		Code        string `json:"code"`
		Tags        string `json:"tags"`
		Description string `json:"description"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request"})
	}

	snippet := model.Snippet{
		ID:          uuid.New(),
		UserID:      uid,
		Title:       input.Title,
		Language:    input.Language,
		Code:        input.Code,
		Tags:        input.Tags,
		Description: input.Description,
	}

	if err := h.db.Create(&snippet).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to create snippet"})
	}

	return c.Status(201).JSON(snippet)
}

func (h *SnippetHandler) Delete(c *fiber.Ctx) error {
	userID := c.Locals("userId").(string)
	uid, _ := uuid.Parse(userID)

	if err := h.db.Where("id = ? AND user_id = ?", c.Params("id"), uid).Delete(&model.Snippet{}).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to delete"})
	}
	return c.JSON(fiber.Map{"message": "Deleted"})
}

func (h *SnippetHandler) Search(c *fiber.Ctx) error {
	userID := c.Locals("userId").(string)
	uid, _ := uuid.Parse(userID)
	tag := c.Query("tag")

	var snippets []model.Snippet
	query := h.db.Where("user_id = ?", uid)
	if tag != "" {
		query = query.Where("tags LIKE ?", "%"+tag+"%")
	}
	if err := query.Find(&snippets).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Search failed"})
	}
	return c.JSON(fiber.Map{"data": snippets})
}
