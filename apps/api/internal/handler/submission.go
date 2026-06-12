package handler

import (
	"strconv"

	"github.com/IDika31/cphub/api/internal/repository"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

type SubmissionHandler struct {
	repo *repository.SubmissionRepository
}

func NewSubmissionHandler(repo *repository.SubmissionRepository) *SubmissionHandler {
	return &SubmissionHandler{repo: repo}
}

func (h *SubmissionHandler) ListLocal(c *fiber.Ctx) error {
	userID, _ := uuid.Parse(c.Locals("userId").(string))
	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "50"))

	offset := (page - 1) * limit
	subs, total, err := h.repo.FindLocalByUser(userID, limit, offset)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to fetch submissions"})
	}

	return c.JSON(fiber.Map{"data": subs, "total": total, "page": page, "limit": limit})
}

func (h *SubmissionHandler) ListExternal(c *fiber.Ctx) error {
	userID, _ := uuid.Parse(c.Locals("userId").(string))
	provider := c.Query("provider")
	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "50"))

	offset := (page - 1) * limit
	subs, total, err := h.repo.FindExternalByUser(userID, provider, limit, offset)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to fetch submissions"})
	}

	return c.JSON(fiber.Map{"data": subs, "total": total, "page": page, "limit": limit})
}
