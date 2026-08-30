package handler

import (
	"log"
	"strings"

	"github.com/IDika31/cphub/api/internal/model"
	"github.com/gofiber/fiber/v2"
)

// maxStatementBatch is how many refs one call will hand out. The extension fetches them
// one Codeforces page at a time in a background tab, so a long list would be a request
// that cannot finish inside any sane timeout — the web app asks repeatedly instead, which
// is also what makes the progress bar move and the Stop button work.
const maxStatementBatch = 25

// MissingStatements lists Codeforces problems that match a filter and have no statement
// stored yet.
//
// This is the missing half of the problemset sync. The official API answers
// problemset.problems with title, rating and tags for all ten thousand problems and has no
// method that returns a statement, so a synced problemset is a catalogue of titles: the
// editor opens one and has nothing to read until somebody visits that problem. Bulk-filling
// them needs two things — knowing which ones are empty, which is this endpoint, and a
// browser to read the pages, which is the extension.
//
// Fetching codeforces.com/problemset itself would add nothing: it is the same metadata the
// API already gives, paginated at a hundred rows and behind the Cloudflare gate. The filters
// on that page are worth copying though, so this takes the ones it offers — tags, and a
// rating range — applied to the rows already in the database.
func (h *CFSyncHandler) MissingStatements(c *fiber.Ctx) error {
	limit := c.QueryInt("limit", maxStatementBatch)
	if limit < 1 || limit > maxStatementBatch {
		limit = maxStatementBatch
	}

	q := h.db.Model(&model.Problem{}).
		Where("provider = ?", "codeforces").
		// The point of the list: rows the editor cannot render yet.
		Where("statement = '' OR statement IS NULL").
		// A row with no title is a half-written record, not a problem waiting for prose.
		Where("title <> ''")

	// Codeforces ANDs multiple tags on its own problemset page, so this does too: asking
	// for "dp,trees" means both, not either.
	for _, tag := range splitTags(c.Query("tags")) {
		q = q.Where("LOWER(tags) LIKE ?", `%"`+tag+`"%`)
	}
	if lo := c.QueryInt("minRating", 0); lo > 0 {
		q = q.Where("difficulty >= ?", lo)
	}
	if hi := c.QueryInt("maxRating", 0); hi > 0 {
		q = q.Where("difficulty <= ?", hi)
	}

	// Total first, so the caller can show "37 left" rather than only the batch in hand.
	var remaining int64
	if err := q.Count(&remaining).Error; err != nil {
		log.Printf("[cf-sync] counting statement-less problems: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "Gagal menghitung problem"})
	}

	var rows []model.Problem
	// Easiest first, and by ref for a stable order: the batches are handed out over
	// minutes, and an unstable order would hand the same problem out twice while skipping
	// another.
	if err := q.Order("difficulty ASC").Order("problem_id").Limit(limit).Find(&rows).Error; err != nil {
		log.Printf("[cf-sync] listing statement-less problems: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "Gagal memuat daftar problem"})
	}

	type pending struct {
		ProblemID  string `json:"problemId"`
		Title      string `json:"title"`
		Difficulty int    `json:"difficulty"`
	}
	data := make([]pending, 0, len(rows))
	for _, p := range rows {
		data = append(data, pending{ProblemID: p.ProblemID, Title: p.Title, Difficulty: p.Difficulty})
	}
	return c.JSON(fiber.Map{"data": data, "remaining": remaining})
}

// splitTags reads the comma-separated tag filter, lowercased and trimmed, dropping empties
// so a trailing comma cannot turn into a condition that matches nothing.
func splitTags(raw string) []string {
	out := make([]string, 0, 4)
	for _, part := range strings.Split(raw, ",") {
		tag := strings.ToLower(strings.TrimSpace(part))
		if tag == "" {
			continue
		}
		out = append(out, tag)
	}
	return out
}
