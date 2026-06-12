package handler

import (
	"github.com/IDika31/cphub/api/internal/database"
	"github.com/gofiber/fiber/v2"
)

type DashboardHandler struct{}

func NewDashboardHandler() *DashboardHandler {
	return &DashboardHandler{}
}

func (h *DashboardHandler) Overview(c *fiber.Ctx) error {
	// TODO: Real analytics from DB
	// For now return mock structure
	return c.JSON(fiber.Map{
		"solved":   0,
		"attempted": 0,
		"streak":    0,
		"accuracy":  0.0,
	})
}

func (h *DashboardHandler) RatingHistory(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{"data": []interface{}{}})
}

func (h *DashboardHandler) Heatmap(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{"data": []interface{}{}})
}

func (h *DashboardHandler) TagWeakness(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{"data": []interface{}{}})
}

func (h *DashboardHandler) Health(c *fiber.Ctx) error {
	health := fiber.Map{
		"overall": "ok",
		"database": fiber.Map{
			"status": "ok",
		},
		"cache": fiber.Map{
			"status": "ok",
		},
		"grader": fiber.Map{
			"status": "ok",
		},
	}

	if err := database.HealthCheck(); err != nil {
		health["database"] = fiber.Map{"status": "error", "detail": err.Error()}
		health["overall"] = "degraded"
	}

	if err := database.HealthCheckRedis(); err != nil {
		health["cache"] = fiber.Map{"status": "error", "detail": err.Error()}
		health["overall"] = "degraded"
	}

	return c.JSON(health)
}
