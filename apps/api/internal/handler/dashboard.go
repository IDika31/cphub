package handler

import (
	"github.com/IDika31/cphub/api/internal/database"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type DashboardHandler struct {
	db *gorm.DB
}

func NewDashboardHandler(db *gorm.DB) *DashboardHandler {
	return &DashboardHandler{db: db}
}

func (h *DashboardHandler) Overview(c *fiber.Ctx) error {
	userIDStr := c.Locals("userId").(string)
	userID, _ := uuid.Parse(userIDStr)

	var solved int64
	h.db.Table("problems").Where("status = ?", "solved").Count(&solved)

	var attempted int64
	h.db.Table("problem_logs").Where("user_id = ? AND action = ?", userID, "attempted").
		Distinct("problem_id").Count(&attempted)

	var streak int64
	h.db.Table("problem_logs").Where("user_id = ?", userID).
		Select("COUNT(DISTINCT DATE(timestamp))").Scan(&streak)

	var totalLogs int64
	h.db.Table("problem_logs").Where("user_id = ?", userID).Count(&totalLogs)

	accuracy := 0.0
	if totalLogs > 0 {
		var solvedLogs int64
		h.db.Table("problem_logs").Where("user_id = ? AND action = ?", userID, "solved").Count(&solvedLogs)
		accuracy = float64(solvedLogs) / float64(totalLogs) * 100
	}

	var cfRating int
	var cfHandle string
	h.db.Table("linked_accounts").
		Where("user_id = ? AND provider = ? AND is_connected = ?", userID, "codeforces", true).
		Select("rating, handle").Row().Scan(&cfRating, &cfHandle)

	return c.JSON(fiber.Map{
		"solved":    solved,
		"attempted": attempted,
		"streak":    streak,
		"accuracy":  accuracy,
		"cfHandle":  cfHandle,
		"cfRating":  cfRating,
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
