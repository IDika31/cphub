package handler

// Everything on this page used to be derived from live Codeforces API calls —
// Overview, Heatmap and TagWeakness each pulled 200-500 submissions on every
// dashboard load. Four concurrent calls against a 1-request-per-2-seconds limit
// meant most loads came back empty, and TLX contributed nothing at all because
// no code path looked at it.
//
// These aggregates now read the synced rows in Postgres instead: every provider
// is treated the same way, one round trip per chart, and no rate limit.

import (
	"sort"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type verdictCount struct {
	Verdict string `json:"verdict"`
	Count   int    `json:"count"`
}

type languageCount struct {
	Language string `json:"language"`
	Count    int    `json:"count"`
}

type difficultyBucket struct {
	Bucket string `json:"bucket"`
	Total  int    `json:"total"`
	Solved int    `json:"solved"`
	Order  int    `json:"order"`
}

// officialStats are the provider's own per-problem figures. CPHub derives its
// numbers from the submissions it can fetch, which for TLX is less history than
// the site itself counts — so both are reported and labelled.
type officialStats struct {
	Score          int64  `json:"score"`
	ProblemsTried  int    `json:"problemsTried"`
	ProblemsSolved int    `json:"problemsSolved"`
	SyncedAt       string `json:"syncedAt,omitempty"`
}

type providerStats struct {
	Provider string `json:"provider"`
	Handle   string `json:"handle"`
	// Account name on this judge. tlx-custom keeps the instance host in Handle,
	// so its username has to travel separately — the UI shows this beside the
	// label and falls back to Handle for the judges where they are the same.
	ProviderUsername string `json:"providerUsername,omitempty"`
	// What the user named a self-hosted instance in the extension; empty for the
	// judges whose name is fixed.
	DisplayName   string             `json:"displayName,omitempty"`
	Connected     bool               `json:"connected"`
	Rating        int                `json:"rating"`
	MaxRating     int                `json:"maxRating"`
	Submissions   int                `json:"submissions"`
	Accepted      int                `json:"accepted"`
	Solved        int                `json:"solved"`
	Attempted     int                `json:"attempted"`
	Accuracy      float64            `json:"accuracy"`
	SolveRate     float64            `json:"solveRate"`
	AvgRuntime    int                `json:"avgRuntime"`
	Library       int                `json:"library"`
	FirstActivity string             `json:"firstActivity,omitempty"`
	LastActivity  string             `json:"lastActivity,omitempty"`
	Verdicts      []verdictCount     `json:"verdicts"`
	Languages     []languageCount    `json:"languages"`
	Difficulty    []difficultyBucket `json:"difficulty"`
	Official      *officialStats     `json:"official,omitempty"`
}

// rawSubmission is the minimum needed to build every aggregate in one pass.
type rawSubmission struct {
	Provider    string
	ProblemRef  string
	Verdict     string
	Language    string
	Runtime     int
	SubmittedAt *time.Time
	Difficulty  int
}

// loadSubmissions pulls the user's external submissions joined to the problem
// library, so CF difficulty is available without a second query. Problems are
// matched on (provider, problem_ref) because problem_id may be unset on rows
// synced before submissions were linked.
func loadSubmissions(db *gorm.DB, userID uuid.UUID) ([]rawSubmission, error) {
	var rows []rawSubmission
	err := db.Table("external_submissions AS es").
		Select(`es.provider,
			es.problem_ref,
			es.verdict,
			es.language,
			es.runtime,
			COALESCE(es.submitted_at, es.created_at) AS submitted_at,
			COALESCE(p.difficulty, 0) AS difficulty`).
		Joins("LEFT JOIN problems p ON p.provider = es.provider AND p.problem_id = es.problem_ref").
		Where("es.user_id = ?", userID).
		Scan(&rows).Error
	return rows, err
}

// aggregate folds one provider's submissions into the shape the dashboard draws.
func aggregate(provider string, rows []rawSubmission) providerStats {
	st := providerStats{
		Provider:  provider,
		Verdicts:  []verdictCount{},
		Languages: []languageCount{},
	}

	verdicts := map[string]int{}
	languages := map[string]int{}
	solvedRefs := map[string]bool{}
	triedRefs := map[string]bool{}
	buckets := map[string]*difficultyBucket{}
	bucketSolved := map[string]map[string]bool{}
	bucketTried := map[string]map[string]bool{}

	var runtimeSum, runtimeN int
	var first, last time.Time

	for _, r := range rows {
		v := normalizeVerdict(r.Verdict)
		verdicts[v]++
		st.Submissions++
		// Accepted is per submission, like totals() and Activity() count it. It used
		// to sit behind the problem_ref guard below, so a row synced without a ref —
		// the sync endpoint only requires provider and submissionId — showed up in
		// the AC bar of the verdict chart while Accuracy read 0%.
		if v == VerdictAC {
			st.Accepted++
		}

		if r.Language != "" {
			languages[r.Language]++
		}
		if r.Runtime > 0 {
			runtimeSum += r.Runtime
			runtimeN++
		}
		if r.SubmittedAt != nil && !r.SubmittedAt.IsZero() {
			t := *r.SubmittedAt
			if first.IsZero() || t.Before(first) {
				first = t
			}
			if last.IsZero() || t.After(last) {
				last = t
			}
		}

		ref := r.ProblemRef
		// Everything past here is keyed by problem, so a missing ref has to be
		// dropped: "" would otherwise count as one phantom problem in Solved,
		// Attempted and the unrated difficulty band. Submission counts above are
		// unaffected.
		if ref == "" {
			continue
		}
		triedRefs[ref] = true
		if v == VerdictAC {
			solvedRefs[ref] = true
		}

		// Difficulty bands are counted per problem, not per submission: twelve
		// attempts at one problem is still one problem in that band.
		b := ratingBucket(r.Difficulty)
		if _, ok := buckets[b]; !ok {
			buckets[b] = &difficultyBucket{Bucket: b, Order: r.Difficulty}
			bucketSolved[b] = map[string]bool{}
			bucketTried[b] = map[string]bool{}
		}
		bucketTried[b][ref] = true
		if v == VerdictAC {
			bucketSolved[b][ref] = true
		}
	}

	st.Solved = len(solvedRefs)
	st.Attempted = len(triedRefs)
	if st.Submissions > 0 {
		st.Accuracy = float64(st.Accepted) / float64(st.Submissions) * 100
	}
	if st.Attempted > 0 {
		st.SolveRate = float64(st.Solved) / float64(st.Attempted) * 100
	}
	if runtimeN > 0 {
		st.AvgRuntime = runtimeSum / runtimeN
	}
	if !first.IsZero() {
		st.FirstActivity = first.UTC().Format(time.RFC3339)
	}
	if !last.IsZero() {
		st.LastActivity = last.UTC().Format(time.RFC3339)
	}

	for _, v := range VerdictOrder {
		if n := verdicts[v]; n > 0 {
			st.Verdicts = append(st.Verdicts, verdictCount{Verdict: v, Count: n})
		}
	}
	st.Languages = topLanguages(languages, 6)
	st.Difficulty = sortedBuckets(buckets, bucketTried, bucketSolved)
	return st
}

func topLanguages(counts map[string]int, n int) []languageCount {
	out := make([]languageCount, 0, len(counts))
	for lang, c := range counts {
		out = append(out, languageCount{Language: lang, Count: c})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Count != out[j].Count {
			return out[i].Count > out[j].Count
		}
		return out[i].Language < out[j].Language
	})
	if len(out) > n {
		// Everything past the cut is real usage, so it is summed rather than dropped.
		rest := 0
		for _, l := range out[n:] {
			rest += l.Count
		}
		out = append(out[:n:n], languageCount{Language: "lainnya", Count: rest})
	}
	return out
}

func sortedBuckets(
	buckets map[string]*difficultyBucket,
	tried, solved map[string]map[string]bool,
) []difficultyBucket {
	out := make([]difficultyBucket, 0, len(buckets))
	for name, b := range buckets {
		b.Total = len(tried[name])
		b.Solved = len(solved[name])
		out = append(out, *b)
	}
	sort.Slice(out, func(i, j int) bool {
		// "unrated" sorts last; the rest ascend by rating.
		if (out[i].Bucket == "unrated") != (out[j].Bucket == "unrated") {
			return out[j].Bucket == "unrated"
		}
		return out[i].Order < out[j].Order
	})
	return out
}

// streaks walks the distinct active days newest-first and returns the current
// streak (counting today or yesterday as still alive) and the longest ever.
// The old implementation returned COUNT(DISTINCT date) — total active days,
// which is not a streak at all.
func streaks(days []time.Time) (current, longest int) {
	if len(days) == 0 {
		return 0, 0
	}
	seen := make([]time.Time, 0, len(days))
	uniq := map[string]bool{}
	for _, d := range days {
		key := d.UTC().Format("2006-01-02")
		if uniq[key] {
			continue
		}
		uniq[key] = true
		seen = append(seen, d.UTC().Truncate(24*time.Hour))
	}
	sort.Slice(seen, func(i, j int) bool { return seen[i].After(seen[j]) })

	today := time.Now().UTC().Truncate(24 * time.Hour)
	run := 1
	longest = 1
	for i := 1; i < len(seen); i++ {
		if seen[i-1].Sub(seen[i]) == 24*time.Hour {
			run++
		} else {
			run = 1
		}
		if run > longest {
			longest = run
		}
	}

	gap := today.Sub(seen[0])
	if gap > 24*time.Hour {
		return 0, longest
	}
	current = 1
	for i := 1; i < len(seen); i++ {
		if seen[i-1].Sub(seen[i]) != 24*time.Hour {
			break
		}
		current++
	}
	return current, longest
}
