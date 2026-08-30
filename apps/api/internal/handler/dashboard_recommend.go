package handler

import (
	"encoding/json"
	"log"
	"sort"
	"strings"

	"github.com/IDika31/cphub/api/internal/model"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// tagStat is one tag's record for this user, counted per problem rather than per
// submission: five failed attempts at one dp problem is one dp problem gone wrong, not
// five dp weaknesses.
type tagStat struct {
	Tag      string  `json:"tag"`
	Total    int     `json:"total"`
	Failed   int     `json:"failed"`
	Solved   int     `json:"solved"`
	PassRate float64 `json:"passRate"`
}

// tagStats is shared by the tag-weakness panel and the recommender, which need the same
// numbers for different reasons — one to show them, one to pick problems from them.
// Ordered worst first: lowest pass rate, and among equals the tag with more attempts,
// because a 0% on six problems says more than a 0% on one.
func (h *DashboardHandler) tagStats(userID uuid.UUID, provider string) ([]tagStat, error) {
	var rows []struct {
		Provider   string
		ProblemRef string
		Verdict    string
		Tags       string
	}
	q := h.db.Table("external_submissions AS es").
		Select("es.provider, es.problem_ref, es.verdict, COALESCE(p.tags, '[]') AS tags").
		Joins("JOIN problems p ON p.provider = es.provider AND p.problem_id = es.problem_ref").
		Where("es.user_id = ?", userID)
	if provider != "" {
		q = q.Where("es.provider = ?", provider)
	}
	if err := q.Scan(&rows).Error; err != nil {
		return nil, err
	}

	tried := map[string]map[string]bool{}
	solved := map[string]map[string]bool{}
	for _, r := range rows {
		var tags []string
		if e := json.Unmarshal([]byte(r.Tags), &tags); e != nil {
			continue
		}
		key := r.Provider + "/" + r.ProblemRef
		for _, t := range tags {
			if t == "" {
				continue
			}
			if tried[t] == nil {
				tried[t] = map[string]bool{}
				solved[t] = map[string]bool{}
			}
			tried[t][key] = true
			if isAccepted(r.Verdict) {
				solved[t][key] = true
			}
		}
	}

	out := make([]tagStat, 0, len(tried))
	for tag, problems := range tried {
		total := len(problems)
		ok := len(solved[tag])
		out = append(out, tagStat{
			Tag:      tag,
			Total:    total,
			Solved:   ok,
			Failed:   total - ok,
			PassRate: float64(ok) / float64(total) * 100,
		})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].PassRate != out[j].PassRate {
			return out[i].PassRate < out[j].PassRate
		}
		return out[i].Total > out[j].Total
	})
	return out, nil
}

// recommendation is one problem worth opening next, with the reason it was picked —
// a list of problems with no reason attached is a list nobody trusts.
type recommendation struct {
	ProblemID  string `json:"problemId"`
	Title      string `json:"title"`
	Difficulty int    `json:"difficulty"`
	Tags       string `json:"tags"`
	URL        string `json:"url"`
	Reason     string `json:"reason"`
}

// recommendWeakTags is how many of the user's weakest tags the picks are drawn from.
// Three keeps the list varied without reaching into tags they have barely touched.
const recommendWeakTags = 3

// recommendMinAttempts is how many problems a tag needs before its pass rate is treated
// as a signal. One failed problem is a bad day, not a weakness.
const recommendMinAttempts = 2

// Recommendations answers "what should I solve next" from data the dashboard already
// holds: the tags this user fails at, and the rating they are working at.
//
// Nothing is fetched. The tag record comes from their own submissions joined to the
// problems table, the rating from the linked account, and the candidates from the
// problemset that is already synced — so this costs two queries and no network.
//
// Codeforces only, and deliberately: it is the provider whose problems carry both a
// difficulty and tags, which is what makes a pick explainable at all. A TLX-only user
// gets an empty list rather than an arbitrary one.
func (h *DashboardHandler) Recommendations(c *fiber.Ctx) error {
	userID, err := uuid.Parse(c.Locals("userId").(string))
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "Unauthenticated"})
	}
	limit := c.QueryInt("limit")
	if limit <= 0 || limit > 30 {
		limit = 8
	}
	const provider = "codeforces"

	stats, err := h.tagStats(userID, provider)
	if err != nil {
		log.Printf("[dashboard] recommendations: tag stats failed: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "Failed to read tag history"})
	}
	weak := make([]string, 0, recommendWeakTags)
	for _, st := range stats {
		if st.Total < recommendMinAttempts || st.PassRate >= 100 {
			continue
		}
		weak = append(weak, st.Tag)
		if len(weak) == recommendWeakTags {
			break
		}
	}

	lo, hi, basis := h.ratingBand(userID, provider)

	q := h.db.Model(&model.Problem{}).
		Where("provider = ? AND difficulty BETWEEN ? AND ?", provider, lo, hi).
		// Untouched, not merely unsolved: a problem they are already fighting with is
		// not a recommendation, it is their current tab.
		Where(`NOT EXISTS (SELECT 1 FROM external_submissions es
			WHERE es.user_id = ? AND es.provider = problems.provider AND es.problem_ref = problems.problem_id)`, userID).
		Where(`NOT EXISTS (SELECT 1 FROM local_submissions ls
			WHERE ls.user_id = ? AND ls.problem_id = problems.id)`, userID).
		// A problem with no statement yet is still worth opening — the page fetches one
		// on demand — but one with no title is a half-written row.
		Where("title <> ''")
	if len(weak) > 0 {
		// Same quote-anchored match the problemset filter uses, so "dp" cannot hit
		// "dp on trees" as a substring of another tag's text.
		tagQ := h.db.Session(&gorm.Session{NewDB: true})
		for i, tag := range weak {
			cond := `LOWER(tags) LIKE ?`
			pattern := `%"` + strings.ToLower(tag) + `"%`
			if i == 0 {
				tagQ = tagQ.Where(cond, pattern)
			} else {
				tagQ = tagQ.Or(cond, pattern)
			}
		}
		q = q.Where(tagQ)
	}

	var rows []model.Problem
	// Easiest first inside the band: the point is to start, not to be impressed.
	if err := q.Order("difficulty ASC").Order("id").Limit(limit).Find(&rows).Error; err != nil {
		log.Printf("[dashboard] recommendations: candidate query failed: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "Failed to pick problems"})
	}

	out := make([]recommendation, 0, len(rows))
	for _, p := range rows {
		out = append(out, recommendation{
			ProblemID:  p.ProblemID,
			Title:      p.Title,
			Difficulty: p.Difficulty,
			Tags:       p.Tags,
			URL:        p.URL,
			Reason:     recommendReason(p, weak),
		})
	}
	return c.JSON(fiber.Map{
		"data": out,
		// What the picks were based on, so the panel can say it out loud instead of
		// presenting eight problems as an oracle.
		"basis": fiber.Map{
			"ratingFrom": basis,
			"band":       []int{lo, hi},
			"weakTags":   weak,
		},
	})
}

// recommendReason names the weak tag this problem covers, or the band it sits in when
// the pick was made on rating alone.
func recommendReason(p model.Problem, weak []string) string {
	lower := strings.ToLower(p.Tags)
	for _, tag := range weak {
		if strings.Contains(lower, `"`+strings.ToLower(tag)+`"`) {
			return tag
		}
	}
	return "level"
}

// ratingBand is the difficulty window to recommend inside, plus a word for where it came
// from so the UI can explain itself.
//
// Slightly above where they are, never below: the band opens 100 under the current
// rating — enough to catch a tag they have never touched at their own level — and
// reaches 300 over it, which is the range where a problem is still solvable and no
// longer automatic.
func (h *DashboardHandler) ratingBand(userID uuid.UUID, provider string) (lo, hi int, basis string) {
	const (
		floor        = 800  // Codeforces' own lowest rating; nothing exists below it.
		defaultLo    = 800  // A user with no history at all starts at the bottom.
		defaultHi    = 1300 // ...and not so high that everything looks impossible.
		bandBelow    = 100
		bandAbove    = 300
		defaultBasis = "default"
	)

	var rating int
	if err := h.db.Table("linked_accounts").
		Where("user_id = ? AND provider = ?", userID, provider).
		Select("COALESCE(MAX(rating), 0)").
		Scan(&rating).Error; err != nil {
		log.Printf("[dashboard] recommendations: rating lookup failed: %v", err)
	}
	if rating > 0 {
		lo = rating - bandBelow
		if lo < floor {
			lo = floor
		}
		return lo, rating + bandAbove, "rating"
	}

	// No official rating — a fresh link, or an account that has never been rated. What
	// they have actually solved says the same thing in a rougher way.
	var avg float64
	if err := h.db.Table("external_submissions AS es").
		Joins("JOIN problems p ON p.provider = es.provider AND p.problem_id = es.problem_ref").
		Where("es.user_id = ? AND es.provider = ? AND p.difficulty > 0", userID, provider).
		Where("UPPER(TRIM(es.verdict)) IN ('OK','AC','ACCEPTED')").
		Select("COALESCE(AVG(p.difficulty), 0)").
		Scan(&avg).Error; err != nil {
		log.Printf("[dashboard] recommendations: solved-difficulty average failed: %v", err)
	}
	if avg >= float64(floor) {
		solved := int(avg)
		lo = solved - bandBelow
		if lo < floor {
			lo = floor
		}
		return lo, solved + bandAbove, "solved"
	}
	return defaultLo, defaultHi, defaultBasis
}
