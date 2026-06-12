package handler

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"

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

type CFSubmission struct {
	Verdict string `json:"verdict"`
	Problem struct {
		Name string `json:"name"`
	} `json:"problem"`
}

type CFStatusResponse struct {
	Status string         `json:"status"`
	Result []CFSubmission `json:"result"`
}

func (h *DashboardHandler) Overview(c *fiber.Ctx) error {
	userIDStr := c.Locals("userId").(string)
	userID, _ := uuid.Parse(userIDStr)

	var cfHandle, cfToken string
	var cfRating int
	h.db.Table("linked_accounts").
		Where("user_id = ? AND provider = ? AND is_connected = ?", userID, "codeforces", true).
		Select("handle, rating, access_token").Row().Scan(&cfHandle, &cfRating, &cfToken)

	var solved, attempted, streak int64
	var accuracy float64

	// Fetch real CF submission data
	if cfHandle != "" && cfToken != "" {
		solved, attempted = fetchCFStats(cfHandle)

		// Simple streak: count consecutive days with submissions
		// For now approximate from local data
		h.db.Table("problem_logs").Where("user_id = ?", userID).
			Select("COUNT(DISTINCT DATE(timestamp))").Scan(&streak)

		if attempted > 0 {
			accuracy = float64(solved) / float64(attempted) * 100
		}
	} else {
		// Fallback to local DB
		h.db.Table("problems").Where("status = ?", "solved").Count(&solved)
		h.db.Table("problem_logs").Where("user_id = ? AND action = ?", userID, "attempted").
			Distinct("problem_id").Count(&attempted)
	}

	return c.JSON(fiber.Map{
		"solved":    solved,
		"attempted": attempted,
		"streak":    streak,
		"accuracy":  accuracy,
		"cfHandle":  cfHandle,
		"cfRating":  cfRating,
	})
}

func fetchCFStats(handle string) (solved int64, attempted int64) {
	url := fmt.Sprintf("https://codeforces.com/api/user.status?handle=%s&from=1&count=200", handle)

	resp, err := http.Get(url)
	if err != nil {
		log.Printf("[dashboard] CF API error: %v", err)
		return 0, 0
	}
	defer resp.Body.Close()

	var cfResp CFStatusResponse
	if err := json.NewDecoder(resp.Body).Decode(&cfResp); err != nil {
		log.Printf("[dashboard] CF decode error: %v", err)
		return 0, 0
	}

	if cfResp.Status != "OK" {
		return 0, 0
	}

	uniqueSolved := make(map[string]bool)
	for _, sub := range cfResp.Result {
		_ = sub
		attempted++
		if sub.Verdict == "OK" {
			uniqueSolved[sub.Problem.Name] = true
		}
	}

	return int64(len(uniqueSolved)), attempted
}

func (h *DashboardHandler) SyncCF(c *fiber.Ctx) error {
	userIDStr := c.Locals("userId").(string)
	userID, _ := uuid.Parse(userIDStr)

	var handle string
	h.db.Table("linked_accounts").Where("user_id = ? AND provider = ?", userID, "codeforces").Select("handle").Scan(&handle)
	if handle == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Codeforces not connected"})
	}

	url := fmt.Sprintf("https://codeforces.com/api/user.status?handle=%s&from=1&count=200", handle)
	resp, err := http.Get(url)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "CF API error"})
	}
	defer resp.Body.Close()

	var cfResp CFStatusResponse
	json.NewDecoder(resp.Body).Decode(&cfResp)

	count := 0
	for _, sub := range cfResp.Result {
		problemRef := sub.Problem.Name
		h.db.Table("problem_logs").Where("user_id = ? AND problem_id = ? AND action = ?", userID, problemRef, sub.Verdict).
			FirstOrCreate(&struct {
				ID        uuid.UUID `gorm:"type:uuid;default:gen_random_uuid()"`
				UserID    uuid.UUID
				ProblemID string
				Action    string
			}{UserID: userID, ProblemID: problemRef, Action: sub.Verdict})
		count++
	}

	log.Printf("[sync] synced %d CF submissions for user %s", count, userIDStr)
	return c.JSON(fiber.Map{"status": "ok", "synced": count})
}

func (h *DashboardHandler) RatingHistory(c *fiber.Ctx) error {
	userIDStr := c.Locals("userId").(string)
	userID, _ := uuid.Parse(userIDStr)

	var handle string
	h.db.Table("linked_accounts").Where("user_id = ? AND provider = ? AND is_connected = ?", userID, "codeforces", true).Select("handle").Scan(&handle)

	if handle == "" {
		return c.JSON(fiber.Map{"data": []interface{}{}})
	}

	url := fmt.Sprintf("https://codeforces.com/api/user.rating?handle=%s", handle)
	resp, err := http.Get(url)
	if err != nil {
		return c.JSON(fiber.Map{"data": []interface{}{}})
	}
	defer resp.Body.Close()

	var result struct {
		Status string `json:"status"`
		Result []struct {
			ContestName    string `json:"contestName"`
			NewRating      int    `json:"newRating"`
			RatingUpdateAt int64  `json:"ratingUpdateTimeSeconds"`
		} `json:"result"`
	}
	json.NewDecoder(resp.Body).Decode(&result)

	type ratingPoint struct {
		Contest string `json:"contest"`
		Rating  int    `json:"rating"`
		Date    int64  `json:"date"`
	}
	ratings := make([]ratingPoint, 0, len(result.Result))
	for _, r := range result.Result {
		ratings = append(ratings, ratingPoint{
			Contest: r.ContestName,
			Rating:  r.NewRating,
			Date:    r.RatingUpdateAt,
		})
	}

	return c.JSON(fiber.Map{"data": ratings})
}

func (h *DashboardHandler) Heatmap(c *fiber.Ctx) error {
	userIDStr := c.Locals("userId").(string)
	userID, _ := uuid.Parse(userIDStr)

	var handle string
	h.db.Table("linked_accounts").Where("user_id = ? AND provider = ? AND is_connected = ?", userID, "codeforces", true).Select("handle").Scan(&handle)
	if handle == "" {
		return c.JSON(fiber.Map{"data": []interface{}{}})
	}

	subs, err := FetchCFSubmissions(handle, 500)
	if err != nil {
		return c.JSON(fiber.Map{"data": []interface{}{}})
	}

	// Group by date (YYYY-MM-DD) → count
	dateCount := make(map[string]int)
	for _, sub := range subs {
		// Unix timestamp → date string
		date := fmt.Sprintf("%d", sub.CreationTimeSeconds/86400)
		dateCount[date]++
	}

	type heatmapEntry struct {
		Date  string `json:"date"`
		Count int    `json:"count"`
	}
	result := make([]heatmapEntry, 0, len(dateCount))
	for date, count := range dateCount {
		result = append(result, heatmapEntry{Date: date, Count: count})
	}

	return c.JSON(fiber.Map{"data": result})
}

func (h *DashboardHandler) TagWeakness(c *fiber.Ctx) error {
	userIDStr := c.Locals("userId").(string)
	userID, _ := uuid.Parse(userIDStr)

	var handle string
	h.db.Table("linked_accounts").Where("user_id = ? AND provider = ? AND is_connected = ?", userID, "codeforces", true).Select("handle").Scan(&handle)
	if handle == "" {
		return c.JSON(fiber.Map{"data": []interface{}{}})
	}

	subs, err := FetchCFSubmissions(handle, 500)
	if err != nil {
		return c.JSON(fiber.Map{"data": []interface{}{}})
	}

	// Count failed per tag
	type tagStat struct {
		Tag      string `json:"tag"`
		Total    int    `json:"total"`
		Failed   int    `json:"failed"`
		PassRate float64 `json:"passRate"`
	}
	tagMap := make(map[string]*tagStat)

	for _, sub := range subs {
		for _, tag := range sub.Problem.Tags {
			if _, ok := tagMap[tag]; !ok {
				tagMap[tag] = &tagStat{Tag: tag}
			}
			tagMap[tag].Total++
			if sub.Verdict != "OK" {
				tagMap[tag].Failed++
			}
		}
	}

	// Sort by fail rate (worse first), take top 10
	result := make([]tagStat, 0, len(tagMap))
	for _, s := range tagMap {
		if s.Total > 0 {
			s.PassRate = float64(s.Total-s.Failed) / float64(s.Total) * 100
		}
		result = append(result, *s)
	}

	// Simple sort: most failed first
	for i := 0; i < len(result); i++ {
		for j := i + 1; j < len(result); j++ {
			if result[j].Failed > result[i].Failed {
				result[i], result[j] = result[j], result[i]
			}
		}
	}
	if len(result) > 10 {
		result = result[:10]
	}

	return c.JSON(fiber.Map{"data": result})
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
