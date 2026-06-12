package handler

import (
	"strconv"

	"github.com/IDika31/cphub/api/internal/repository"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

type ProblemHandler struct {
	repo *repository.ProblemRepository
}

func NewProblemHandler(repo *repository.ProblemRepository) *ProblemHandler {
	return &ProblemHandler{repo: repo}
}

func (h *ProblemHandler) List(c *fiber.Ctx) error {
	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "50"))
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 200 {
		limit = 50
	}
	offset := (page - 1) * limit

	filter := make(map[string]interface{})
	if provider := c.Query("provider"); provider != "" {
		filter["provider"] = provider
	}
	if tag := c.Query("tag"); tag != "" {
		filter["tag"] = tag
	}
	if diff := c.Query("difficulty"); diff != "" {
		d, _ := strconv.Atoi(diff)
		filter["difficulty"] = d
	}
	if status := c.Query("status"); status != "" {
		filter["status"] = status
	}

	problems, total, err := h.repo.FindAll(filter, limit, offset)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to fetch problems"})
	}

	return c.JSON(fiber.Map{
		"data":  problems,
		"total": total,
		"page":  page,
		"limit": limit,
	})
}

func (h *ProblemHandler) GetByID(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid problem ID"})
	}

	problem, err := h.repo.FindByID(id)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Problem not found"})
	}

	return c.JSON(problem)
}

func (h *ProblemHandler) Search(c *fiber.Ctx) error {
	query := c.Query("q")
	if query == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Query required"})
	}

	problems, err := h.repo.Search(query, 20)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Search failed"})
	}

	return c.JSON(fiber.Map{"data": problems, "total": len(problems)})
}
