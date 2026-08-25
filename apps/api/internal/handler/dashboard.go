package handler

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sort"
	"time"

	"github.com/IDika31/cphub/api/internal/database"
	"github.com/IDika31/cphub/api/internal/grader"
	"github.com/IDika31/cphub/api/internal/model"
	"github.com/IDika31/cphub/api/internal/provider/tlx"
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

// knownProviders are reported even with zero rows, so an unlinked judge shows as
// "not connected" instead of vanishing from the dashboard.
var knownProviders = []string{"codeforces", "tlx"}

type linkedInfo struct {
	Provider string
	Handle   string
	// tlx-custom keeps the instance host in Handle, so the account name on that
	// judge lives here. Without it the dashboard printed a domain in the slot
	// where every other judge prints a username.
	ProviderUsername string
	DisplayName      string
	Rating           int
	MaxRating        int
	Connected        bool
	TotalScore       int64
	ProblemsTried    int
	ProblemsSolved   int
	StatsSyncedAt    *time.Time
}

func (h *DashboardHandler) linkedAccounts(userID uuid.UUID) map[string]linkedInfo {
	var rows []linkedInfo
	h.db.Table("linked_accounts").
		Select(`provider, handle, provider_username, display_name, rating, max_rating, is_connected AS connected,
			total_score, problems_tried, problems_solved, stats_synced_at`).
		Where("user_id = ?", userID).
		Scan(&rows)
	out := make(map[string]linkedInfo, len(rows))
	for _, r := range rows {
		out[r.Provider] = r
	}
	return out
}

func (h *DashboardHandler) Overview(c *fiber.Ctx) error {
	userID, err := uuid.Parse(c.Locals("userId").(string))
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "Unauthenticated"})
	}

	subs, err := loadSubmissions(h.db, userID)
	if err != nil {
		log.Printf("[dashboard] load submissions failed: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "Failed to load submissions"})
	}

	linked := h.linkedAccounts(userID)

	// Problem library counts are global: problems have no owner, they are the
	// shared pool the editor reads from. Labelled as "library" so it is not
	// mistaken for a personal solve count.
	library := map[string]int{}
	var libRows []struct {
		Provider string
		Total    int
	}
	h.db.Table("problems").Select("provider, COUNT(*) AS total").Group("provider").Scan(&libRows)
	libraryTotal := 0
	for _, r := range libRows {
		library[r.Provider] = r.Total
		libraryTotal += r.Total
	}

	byProvider := map[string][]rawSubmission{}
	for _, s := range subs {
		byProvider[s.Provider] = append(byProvider[s.Provider], s)
	}

	seen := map[string]bool{}
	providers := make([]providerStats, 0, len(byProvider)+len(knownProviders))
	add := func(name string) {
		if seen[name] {
			return
		}
		seen[name] = true
		st := aggregate(name, byProvider[name])
		st.Library = library[name]
		if info, ok := linked[name]; ok {
			st.Handle = info.Handle
			st.ProviderUsername = info.ProviderUsername
			st.DisplayName = info.DisplayName
			st.Connected = info.Connected
			st.Rating = info.Rating
			st.MaxRating = info.MaxRating
			// Only surfaced when the provider actually reported something, so the
			// UI can tell "not synced yet" from "genuinely zero".
			if info.ProblemsTried > 0 || info.TotalScore > 0 {
				st.Official = &officialStats{
					Score:          info.TotalScore,
					ProblemsTried:  info.ProblemsTried,
					ProblemsSolved: info.ProblemsSolved,
				}
				if info.StatsSyncedAt != nil {
					st.Official.SyncedAt = info.StatsSyncedAt.UTC().Format(time.RFC3339)
				}
			}
		}
		providers = append(providers, st)
	}
	for _, p := range knownProviders {
		add(p)
	}
	// A judge that is linked but not yet synced still deserves a card, otherwise a
	// freshly connected self-hosted instance is invisible here until its first
	// sync — which is exactly when the user goes looking for it.
	for name := range linked {
		if name == "google" {
			continue // login identity, not a judge
		}
		add(name)
	}
	for name := range byProvider {
		add(name)
	}
	sort.Slice(providers, func(i, j int) bool {
		if providers[i].Submissions != providers[j].Submissions {
			return providers[i].Submissions > providers[j].Submissions
		}
		return providers[i].Provider < providers[j].Provider
	})

	return c.JSON(fiber.Map{
		"providers": providers,
		"totals":    h.totals(userID, subs),
		"library":   fiber.Map{"total": libraryTotal, "byProvider": library},
		"localRuns": h.localRunStats(userID),
	})
}

// totals mixes external judges with local grader runs for the streak, because a
// day spent testing locally is still a day of practice.
func (h *DashboardHandler) totals(userID uuid.UUID, subs []rawSubmission) fiber.Map {
	solved := map[string]bool{}
	tried := map[string]bool{}
	accepted := 0
	days := make([]time.Time, 0, len(subs))

	for _, s := range subs {
		if isAccepted(s.Verdict) {
			accepted++
			if s.ProblemRef != "" {
				solved[s.Provider+"/"+s.ProblemRef] = true
			}
		}
		if s.ProblemRef != "" {
			tried[s.Provider+"/"+s.ProblemRef] = true
		}
		if s.SubmittedAt != nil && !s.SubmittedAt.IsZero() {
			days = append(days, *s.SubmittedAt)
		}
	}

	// Local grader runs count toward the streak too — a day spent testing
	// locally is still practice. Selected as a named column rather than via
	// Pluck, which expects a plain column name and not an expression.
	var localRows []struct{ RanAt time.Time }
	h.db.Table("local_submissions").
		Select("COALESCE(executed_at, created_at) AS ran_at").
		Where("user_id = ?", userID).
		Scan(&localRows)
	for _, r := range localRows {
		if !r.RanAt.IsZero() {
			days = append(days, r.RanAt)
		}
	}

	current, longest := streaks(days)

	accuracy := 0.0
	if len(subs) > 0 {
		accuracy = float64(accepted) / float64(len(subs)) * 100
	}

	return fiber.Map{
		"submissions":   len(subs),
		"accepted":      accepted,
		"solved":        len(solved),
		"attempted":     len(tried),
		"accuracy":      accuracy,
		"streak":        current,
		"longestStreak": longest,
	}
}

func (h *DashboardHandler) localRunStats(userID uuid.UUID) fiber.Map {
	var rows []struct {
		Verdict string
		Count   int
	}
	h.db.Table("local_submissions").
		Select("verdict, COUNT(*) AS count").
		Where("user_id = ?", userID).
		Group("verdict").
		Scan(&rows)

	merged := map[string]int{}
	total := 0
	for _, r := range rows {
		merged[normalizeVerdict(r.Verdict)] += r.Count
		total += r.Count
	}
	verdicts := make([]verdictCount, 0, len(merged))
	for _, v := range VerdictOrder {
		if n := merged[v]; n > 0 {
			verdicts = append(verdicts, verdictCount{Verdict: v, Count: n})
		}
	}
	return fiber.Map{"total": total, "verdicts": verdicts}
}

// Activity is the calendar heatmap. The old version emitted
// creationTimeSeconds/86400 — a day number since the epoch, not a date, so the
// client had nothing renderable — and only ever looked at Codeforces.
func (h *DashboardHandler) Activity(c *fiber.Ctx) error {
	userID, err := uuid.Parse(c.Locals("userId").(string))
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "Unauthenticated"})
	}
	days := 365
	if d := c.QueryInt("days"); d > 0 && d <= 730 {
		days = d
	}
	since := time.Now().UTC().AddDate(0, 0, -days).Truncate(24 * time.Hour)

	var rows []struct {
		Day      time.Time
		Provider string
		Verdict  string
		Count    int
	}
	h.db.Table("external_submissions").
		Select(`DATE_TRUNC('day', COALESCE(submitted_at, created_at)) AS day,
			provider, verdict, COUNT(*) AS count`).
		Where("user_id = ? AND COALESCE(submitted_at, created_at) >= ?", userID, since).
		Group("day, provider, verdict").
		Scan(&rows)

	type dayEntry struct {
		Date   string `json:"date"`
		Count  int    `json:"count"`
		Solved int    `json:"solved"`
		// Per provider, so a scoped view can show that provider's own numbers
		// instead of inheriting another judge's AC count for the same day.
		ByProvider       map[string]int `json:"byProvider"`
		SolvedByProvider map[string]int `json:"solvedByProvider"`
	}
	byDate := map[string]*dayEntry{}
	for _, r := range rows {
		key := r.Day.UTC().Format("2006-01-02")
		e, ok := byDate[key]
		if !ok {
			e = &dayEntry{Date: key, ByProvider: map[string]int{}, SolvedByProvider: map[string]int{}}
			byDate[key] = e
		}
		e.Count += r.Count
		e.ByProvider[r.Provider] += r.Count
		if isAccepted(r.Verdict) {
			e.Solved += r.Count
			e.SolvedByProvider[r.Provider] += r.Count
		}
	}

	out := make([]dayEntry, 0, len(byDate))
	for _, e := range byDate {
		out = append(out, *e)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Date < out[j].Date })

	return c.JSON(fiber.Map{"data": out, "since": since.Format("2006-01-02"), "days": days})
}

// Heatmap keeps the old route working; Activity is the real implementation.
func (h *DashboardHandler) Heatmap(c *fiber.Ctx) error { return h.Activity(c) }

// TagWeakness now reads the synced problem library instead of re-downloading 500
// Codeforces submissions per request, so it works for every provider that ships
// tags and never trips the CF rate limit. Sorting is done here, ascending by
// pass rate — the old version cut the list by "most failed" before the client
// sorted by pass rate, which could drop the actual weakest tags off the end.
func (h *DashboardHandler) TagWeakness(c *fiber.Ctx) error {
	userID, err := uuid.Parse(c.Locals("userId").(string))
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "Unauthenticated"})
	}
	provider := c.Query("provider")
	limit := c.QueryInt("limit")
	if limit <= 0 || limit > 50 {
		limit = 12
	}

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
		return c.Status(500).JSON(fiber.Map{"error": "Failed to load tags"})
	}

	type tagStat struct {
		Tag      string  `json:"tag"`
		Total    int     `json:"total"`
		Failed   int     `json:"failed"`
		Solved   int     `json:"solved"`
		PassRate float64 `json:"passRate"`
	}
	// Counted per problem, not per submission: five failed attempts at one dp
	// problem should not read as five dp weaknesses.
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
	if len(out) > limit {
		out = out[:limit]
	}

	return c.JSON(fiber.Map{"data": out})
}

type ratingPoint struct {
	Label string `json:"label"`
	Value int    `json:"value"`
	Date  int64  `json:"date"`
}

// RatingHistory returns one series per provider. Codeforces has a real rating,
// which only its API knows; TLX has no rating at all, so its series is the
// running total of distinct problems solved over time — the closest honest
// analogue of progress, and it comes from the local DB.
func (h *DashboardHandler) RatingHistory(c *fiber.Ctx) error {
	userID, err := uuid.Parse(c.Locals("userId").(string))
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "Unauthenticated"})
	}
	linked := h.linkedAccounts(userID)

	cf := make([]ratingPoint, 0)
	if info, ok := linked["codeforces"]; ok && info.Handle != "" {
		cf = fetchCFRating(info.Handle)
	}

	// Keys are provider names, plus "local" for Codeforces' own solve curve (the
	// dashboard uses it as the fallback series when TLX has nothing). Every other
	// provider that has synced rows gets its own series, so a self-hosted instance
	// is charted from its own data instead of borrowing the official TLX curve —
	// which is what the tlx-custom tab used to draw.
	out := fiber.Map{
		"codeforces": cf,
		"tlx":        h.solveProgress(userID, "tlx"),
		"local":      h.solveProgress(userID, "codeforces"),
	}
	var others []string
	h.db.Table("external_submissions").
		Distinct("provider").
		Where("user_id = ?", userID).
		Pluck("provider", &others)
	for _, p := range others {
		if _, taken := out[p]; taken || p == "" {
			continue
		}
		out[p] = h.solveProgress(userID, p)
	}

	return c.JSON(out)
}

func fetchCFRating(handle string) []ratingPoint {
	url := fmt.Sprintf("https://codeforces.com/api/user.rating?handle=%s", handle)
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		log.Printf("[dashboard] CF rating fetch failed: %v", err)
		return []ratingPoint{}
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
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil || result.Status != "OK" {
		return []ratingPoint{}
	}

	points := make([]ratingPoint, 0, len(result.Result))
	for _, r := range result.Result {
		points = append(points, ratingPoint{
			Label: r.ContestName,
			Value: r.NewRating,
			Date:  r.RatingUpdateAt,
		})
	}
	return points
}

// solveProgress is the cumulative count of distinct solved problems per day.
func (h *DashboardHandler) solveProgress(userID uuid.UUID, provider string) []ratingPoint {
	var rows []struct {
		ProblemRef string
		Day        time.Time
	}
	h.db.Table("external_submissions").
		Select("problem_ref, MIN(DATE_TRUNC('day', COALESCE(submitted_at, created_at))) AS day").
		Where("user_id = ? AND provider = ? AND problem_ref <> ''", userID, provider).
		Where("UPPER(verdict) IN ('AC','OK','ACCEPTED')").
		Group("problem_ref").
		Scan(&rows)

	perDay := map[string]int{}
	for _, r := range rows {
		perDay[r.Day.UTC().Format("2006-01-02")]++
	}
	dates := make([]string, 0, len(perDay))
	for d := range perDay {
		dates = append(dates, d)
	}
	sort.Strings(dates)

	points := make([]ratingPoint, 0, len(dates))
	running := 0
	for _, d := range dates {
		running += perDay[d]
		t, _ := time.Parse("2006-01-02", d)
		points = append(points, ratingPoint{Label: d, Value: running, Date: t.Unix()})
	}
	return points
}

// SyncCF pulls submission history from the public CF API and refreshes the
// stored rating. Rating used to be written once at OAuth link time and then went
// stale forever, so the dashboard showed whatever the handle was rated on the day
// it was connected.
func (h *DashboardHandler) SyncCF(c *fiber.Ctx) error {
	userID, err := uuid.Parse(c.Locals("userId").(string))
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "Unauthenticated"})
	}

	var handle string
	h.db.Table("linked_accounts").
		Where("user_id = ? AND provider = ?", userID, "codeforces").
		Select("handle").Scan(&handle)
	if handle == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Codeforces not connected"})
	}

	subs, err := FetchCFSubmissions(handle, 2000)
	if err != nil {
		log.Printf("[sync-cf] fetch failed for %s: %v", handle, err)
		return c.Status(502).JSON(fiber.Map{"error": "Codeforces API error: " + err.Error()})
	}

	newProblems, newSubs := 0, 0
	var problemErr, subErr error
	seenProblems := map[string]bool{}
	problemIDs := map[string]uuid.UUID{}

	for _, sub := range subs {
		if sub.Problem.ContestID == 0 || sub.Problem.Index == "" {
			continue
		}
		problemKey := fmt.Sprintf("%d%s", sub.Problem.ContestID, sub.Problem.Index)

		if !seenProblems[problemKey] {
			seenProblems[problemKey] = true
			tagsJSON, _ := json.Marshal(sub.Problem.Tags)
			problem := model.Problem{
				Provider:   "codeforces",
				ProblemID:  problemKey,
				Title:      fmt.Sprintf("%s. %s", sub.Problem.Index, sub.Problem.Name),
				Difficulty: sub.Problem.Rating,
				Tags:       string(tagsJSON),
				URL:        fmt.Sprintf("https://codeforces.com/problemset/problem/%d/%s", sub.Problem.ContestID, sub.Problem.Index),
				Status:     "synced",
			}
			res := h.db.Where("provider = ? AND problem_id = ?", "codeforces", problemKey).
				FirstOrCreate(&problem)
			if res.Error != nil {
				// A schema mismatch here used to be invisible: the loop counted
				// rows it never wrote and reported a successful sync.
				problemErr = res.Error
			} else if res.RowsAffected > 0 {
				newProblems++
			}
			problemIDs[problemKey] = problem.ID
		}

		submittedAt := time.Unix(sub.CreationTimeSeconds, 0)
		submission := model.ExternalSubmission{
			UserID:       userID,
			ProblemID:    problemIDs[problemKey],
			Provider:     "codeforces",
			SubmissionID: fmt.Sprintf("%d", sub.ID),
			ProblemTitle: fmt.Sprintf("%s. %s", sub.Problem.Index, sub.Problem.Name),
			ProblemRef:   problemKey,
			Language:     sub.ProgrammingLanguage,
			Verdict:      sub.Verdict,
			Runtime:      sub.TimeConsumedMillis,
			Memory:       int(sub.MemoryConsumedBytes / 1024),
			SubmittedAt:  &submittedAt,
		}
		res := h.db.Where("user_id = ? AND provider = ? AND submission_id = ?",
			userID, "codeforces", submission.SubmissionID).
			FirstOrCreate(&submission)
		if res.Error != nil {
			subErr = res.Error
		} else if res.RowsAffected > 0 {
			newSubs++
		}
	}

	if problemErr != nil || subErr != nil {
		log.Printf("[sync-cf] %s: write errors (problems: %v, submissions: %v)", handle, problemErr, subErr)
		return c.Status(500).JSON(fiber.Map{
			"error":  "Sync partially failed — the database rejected some rows",
			"detail": firstErr(problemErr, subErr).Error(),
		})
	}

	rating, maxRating := fetchCFUserRating(handle)
	if rating > 0 {
		h.db.Table("linked_accounts").
			Where("user_id = ? AND provider = ?", userID, "codeforces").
			Updates(map[string]interface{}{"rating": rating, "max_rating": maxRating})
	}

	log.Printf("[sync-cf] %s: %d new problems, %d new submissions (of %d fetched)", handle, newProblems, newSubs, len(subs))
	return c.JSON(fiber.Map{
		"status":      "ok",
		"problems":    newProblems,
		"submissions": newSubs,
		"fetched":     len(subs),
		"rating":      rating,
	})
}

func fetchCFUserRating(handle string) (rating, maxRating int) {
	url := fmt.Sprintf("https://codeforces.com/api/user.info?handles=%s", handle)
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return 0, 0
	}
	defer resp.Body.Close()

	var result struct {
		Status string `json:"status"`
		Result []struct {
			Rating    int `json:"rating"`
			MaxRating int `json:"maxRating"`
		} `json:"result"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return 0, 0
	}
	if result.Status != "OK" || len(result.Result) == 0 {
		return 0, 0
	}
	return result.Result[0].Rating, result.Result[0].MaxRating
}

// SyncTLX stores the grading score alongside the verdict. It was fetched and then
// thrown away (`_ = score`), which lost every partial result on subtask-scored
// problems — a 70/100 looked identical to a 0.
// tlxInstance is one Judgels deployment to pull from: the official TLX, or a
// self-hosted one whose only difference is its API base.
type tlxInstance struct {
	Provider string // "tlx" or "tlx-custom"
	Host     string // display/identity: tlx.toki.id, or the custom hostname
	Username string // account name on that instance
	Token    string
	Client   *tlx.Client
}

func (h *DashboardHandler) tlxInstances(userID uuid.UUID) []tlxInstance {
	var rows []struct {
		Provider         string
		Handle           string
		ProviderUsername string
		ProviderUserID   string
		AccessToken      string
	}
	h.db.Table("linked_accounts").
		Select("provider, handle, provider_username, provider_user_id, access_token").
		Where("user_id = ? AND provider IN ? AND is_connected = ?",
			userID, []string{"tlx", ProviderTLXCustom}, true).
		Scan(&rows)

	out := make([]tlxInstance, 0, len(rows))
	for _, r := range rows {
		if r.AccessToken == "" {
			continue // registered but never logged in
		}
		inst := tlxInstance{Provider: r.Provider, Host: r.Handle, Token: r.AccessToken}
		if r.Provider == ProviderTLXCustom {
			inst.Username = r.ProviderUsername
			apiHost := r.ProviderUserID
			if apiHost == "" {
				apiHost = "api." + r.Handle
			}
			inst.Client = tlx.NewClientFor(apiHost)
		} else {
			inst.Username = r.Handle
			inst.Client = tlx.NewClient()
		}
		if inst.Username == "" {
			continue
		}
		out = append(out, inst)
	}
	return out
}

func (h *DashboardHandler) SyncTLX(c *fiber.Ctx) error {
	userID, err := uuid.Parse(c.Locals("userId").(string))
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "Unauthenticated"})
	}

	instances := h.tlxInstances(userID)
	if len(instances) == 0 {
		return c.Status(400).JSON(fiber.Map{"error": "TLX not connected"})
	}

	perInstance := make([]fiber.Map, 0, len(instances))
	totalNew, totalFetched := 0, 0
	var firstFailure error

	for _, inst := range instances {
		res, ierr := h.syncTLXInstance(userID, inst)
		if ierr != nil {
			if firstFailure == nil {
				firstFailure = ierr
			}
			perInstance = append(perInstance, fiber.Map{
				"provider": inst.Provider, "host": inst.Host, "error": ierr.Error(),
			})
			continue
		}
		totalNew += res.NewSubs
		totalFetched += res.Fetched
		entry := fiber.Map{
			"provider": inst.Provider, "host": inst.Host,
			"submissions": res.NewSubs, "fetched": res.Fetched, "rating": res.Rating,
		}
		if res.Official != nil {
			entry["official"] = fiber.Map{
				"score":          res.Official.TotalScores,
				"problemsTried":  res.Official.TotalProblemsTried,
				"problemsSolved": res.Official.Solved(),
			}
		}
		perInstance = append(perInstance, entry)
	}

	if totalFetched == 0 && firstFailure != nil {
		return c.Status(502).JSON(fiber.Map{"error": "TLX API error: " + firstFailure.Error()})
	}

	out := fiber.Map{
		"status":      "ok",
		"submissions": totalNew,
		"fetched":     totalFetched,
		"instances":   perInstance,
	}
	// Keep the flat official-TLX fields the dashboard already reads.
	for _, e := range perInstance {
		if e["provider"] == "tlx" {
			out["rating"] = e["rating"]
			if o, ok := e["official"]; ok {
				out["official"] = o
			}
		}
	}
	return c.JSON(out)
}

type tlxSyncResult struct {
	NewSubs  int
	Fetched  int
	Rating   int
	Official *tlx.UserStats
}

func (h *DashboardHandler) syncTLXInstance(userID uuid.UUID, inst tlxInstance) (*tlxSyncResult, error) {
	provider := inst.Provider
	handle := inst.Username
	token := inst.Token
	client := inst.Client

	result, err := client.GetAllSubmissions(handle, token, 200)
	if err != nil {
		log.Printf("[sync-tlx] %s (%s) fetch error: %v", inst.Host, client.APIBase(), err)
		return nil, err
	}

	newSubs := 0
	var writeErr error
	for _, sub := range result.Data.Page {
		verdictCode := ""
		score := 0
		if sub.LatestGrading != nil {
			verdictCode = sub.LatestGrading.Verdict.Code
			score = sub.LatestGrading.Score
		}

		problemName := result.ProblemNamesMap[sub.ProblemJID]
		alias := result.ProblemAliasesMap[sub.ContainerJID+"-"+sub.ProblemJID]
		contestName := result.ContainerNamesMap[sub.ContainerJID]

		title := problemName
		if alias != "" {
			title = alias + ". " + problemName
		}
		if title == "" {
			title = sub.ProblemJID
		}

		// problem_ref must be stable and match what the problem library stores,
		// otherwise the dashboard cannot count distinct solved problems. The JID
		// is the only stable identifier TLX exposes here.
		problemRef := sub.ProblemJID

		// TLX problems are not in the library until someone imports them, so a
		// submission had nothing to link to. Create the stub here: it fixes the
		// dangling reference AND makes solved TLX problems show up in Problemset.
		problemID := h.ensureTLXProblem(provider, problemRef, title, contestName)

		submittedAt := time.UnixMilli(sub.Time)
		submission := model.ExternalSubmission{
			UserID:       userID,
			Provider:     provider,
			SubmissionID: fmt.Sprintf("%d", sub.ID),
			ProblemTitle: title,
			ProblemRef:   problemRef,
			ProblemGroup: contestName,
			Language:     sub.GradingLanguage,
			Verdict:      verdictCode,
			Score:        score,
			SubmittedAt:  &submittedAt,
			ProblemID:    problemID,
		}
		res := h.db.Where("user_id = ? AND provider = ? AND submission_id = ?",
			userID, provider, submission.SubmissionID).
			FirstOrCreate(&submission)
		if res.Error != nil {
			writeErr = res.Error
		} else if res.RowsAffected > 0 {
			newSubs++
		}
	}

	if writeErr != nil {
		log.Printf("[sync-tlx] %s: write error: %v", inst.Host, writeErr)
		return nil, fmt.Errorf("database rejected some rows: %w", writeErr)
	}

	// TLX has a real rating (the dashboard used to assert it did not). It lives on
	// the public profile, keyed by the account's JID.
	rating := 0
	update := map[string]interface{}{}
	if info, e := client.VerifyToken(token); e == nil && info.JID != "" {
		if prof, e2 := client.GetProfileBasic(info.JID); e2 == nil {
			rating = prof.Rating.PublicRating
			if rating > 0 {
				update["rating"] = rating
				update["max_rating"] = rating
			}
		} else {
			log.Printf("[sync-tlx] could not read profile for %s: %v", info.JID, e2)
		}
	}

	// TLX counts per problem; the submission feed we walk covers less history, so
	// its own figures are stored as the authoritative "according to TLX" numbers.
	var official *tlx.UserStats
	if st, e := client.GetUserStats(handle); e == nil {
		official = st
		now := time.Now()
		update["total_score"] = st.TotalScores
		update["problems_tried"] = st.TotalProblemsTried
		update["problems_solved"] = st.Solved()
		update["stats_synced_at"] = now
	} else {
		log.Printf("[sync-tlx] could not read stats for %s: %v", handle, e)
	}

	if len(update) > 0 {
		h.db.Table("linked_accounts").
			Where("user_id = ? AND provider = ? AND handle = ?", userID, provider, inst.Host).
			Updates(update)
	}

	if official != nil {
		log.Printf("[sync-tlx] %s: %d new of %d fetched, rating %d, provider reports %d/%d problems and %d pts",
			inst.Host, newSubs, len(result.Data.Page), rating, official.Solved(), official.TotalProblemsTried, official.TotalScores)
	} else {
		log.Printf("[sync-tlx] %s: %d new of %d fetched, rating %d", inst.Host, newSubs, len(result.Data.Page), rating)
	}

	return &tlxSyncResult{
		NewSubs:  newSubs,
		Fetched:  len(result.Data.Page),
		Rating:   rating,
		Official: official,
	}, nil
}

// ensureTLXProblem returns the library id for a TLX problem, creating a stub row
// when it is not there yet. Returns the zero UUID on failure, which the model
// turns into a NULL problem_id rather than a foreign-key violation.
func (h *DashboardHandler) ensureTLXProblem(provider, ref, title, group string) uuid.UUID {
	if ref == "" {
		return uuid.Nil
	}
	problem := model.Problem{
		Provider:     provider,
		ProblemID:    ref,
		Title:        title,
		ProblemGroup: group,
		Status:       "synced",
		Tags:         "[]",
	}
	if err := h.db.Where("provider = ? AND problem_id = ?", provider, ref).
		FirstOrCreate(&problem).Error; err != nil {
		log.Printf("[sync-tlx] could not ensure problem %s: %v", ref, err)
		return uuid.Nil
	}
	return problem.ID
}

// Health probes the grader instead of asserting it is fine. The status page drew
// a green dot from a hardcoded "ok".
func (h *DashboardHandler) Health(c *fiber.Ctx) error {
	health := fiber.Map{
		"overall":  "ok",
		"database": fiber.Map{"status": "ok"},
		"cache":    fiber.Map{"status": "ok"},
	}

	if err := database.HealthCheck(); err != nil {
		health["database"] = fiber.Map{"status": "error", "detail": err.Error()}
		health["overall"] = "degraded"
	}
	if err := database.HealthCheckRedis(); err != nil {
		health["cache"] = fiber.Map{"status": "error", "detail": err.Error()}
		health["overall"] = "degraded"
	}

	compilers := grader.CheckCompilers()
	available := make([]string, 0, len(compilers))
	missing := make([]string, 0, len(compilers))
	for lang, ok := range compilers {
		if ok {
			available = append(available, lang)
		} else {
			missing = append(missing, lang)
		}
	}
	sort.Strings(available)
	sort.Strings(missing)

	graderStatus := "ok"
	if len(available) == 0 {
		graderStatus = "error"
		health["overall"] = "degraded"
	} else if len(missing) > 0 {
		graderStatus = "degraded"
		if health["overall"] == "ok" {
			health["overall"] = "degraded"
		}
	}
	health["grader"] = fiber.Map{
		"status":    graderStatus,
		"available": available,
		"missing":   missing,
		"firejail":  grader.CheckFirejail() == nil,
	}

	return c.JSON(health)
}

// firstErr returns the first non-nil error, for one-line reporting.
func firstErr(errs ...error) error {
	for _, e := range errs {
		if e != nil {
			return e
		}
	}
	return nil
}
