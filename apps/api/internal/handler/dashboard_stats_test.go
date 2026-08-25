package handler

import (
	"testing"
	"time"
)

func TestNormalizeVerdictMapsBothJudges(t *testing.T) {
	// Codeforces long form and TLX short codes must land on the same canonical
	// verdict, otherwise per-provider comparison is meaningless.
	cases := map[string]string{
		"OK":                    VerdictAC,
		"AC":                    VerdictAC,
		"WRONG_ANSWER":          VerdictWA,
		"WA":                    VerdictWA,
		"TIME_LIMIT_EXCEEDED":   VerdictTLE,
		"TLE":                   VerdictTLE,
		"MEMORY_LIMIT_EXCEEDED": VerdictMLE,
		"RUNTIME_ERROR":         VerdictRTE,
		"RTE":                   VerdictRTE,
		"COMPILATION_ERROR":     VerdictCE,
		"CE":                    VerdictCE,
		"":                      VerdictPend,
		"?":                     VerdictPend,
		"CHALLENGED":            VerdictOther,
		"SOMETHING_NEW":         VerdictOther,
	}
	for raw, want := range cases {
		if got := normalizeVerdict(raw); got != want {
			t.Errorf("normalizeVerdict(%q) = %q, want %q", raw, got, want)
		}
	}
	if !isAccepted("OK") || !isAccepted("ac") {
		t.Error("isAccepted must treat CF OK and TLX AC as solved")
	}
	if isAccepted("PARTIAL") {
		t.Error("a partial score is not an accepted solution")
	}
}

func TestRatingBucket(t *testing.T) {
	cases := map[int]string{
		0:    "unrated",
		-1:   "unrated",
		700:  "<800",
		800:  "800-999",
		1234: "1200-1399",
		2999: "2800-2999",
		3200: "3000+",
	}
	for rating, want := range cases {
		if got := ratingBucket(rating); got != want {
			t.Errorf("ratingBucket(%d) = %q, want %q", rating, got, want)
		}
	}
}

func TestStreaksCountsConsecutiveDays(t *testing.T) {
	day := func(offset int) time.Time {
		return time.Now().UTC().Truncate(24*time.Hour).AddDate(0, 0, offset)
	}

	// Today, yesterday, the day before: a live 3-day streak. The gap at -5/-6
	// forms an older 2-day run that must not extend the current one.
	days := []time.Time{day(0), day(-1), day(-1), day(-2), day(-5), day(-6)}
	current, longest := streaks(days)
	if current != 3 {
		t.Errorf("current streak = %d, want 3", current)
	}
	if longest != 3 {
		t.Errorf("longest streak = %d, want 3", longest)
	}

	// Nothing recent: the streak is broken even though there is history.
	stale := []time.Time{day(-10), day(-11), day(-12), day(-13)}
	current, longest = streaks(stale)
	if current != 0 {
		t.Errorf("stale current streak = %d, want 0", current)
	}
	if longest != 4 {
		t.Errorf("stale longest streak = %d, want 4", longest)
	}

	if c, l := streaks(nil); c != 0 || l != 0 {
		t.Errorf("streaks(nil) = (%d, %d), want (0, 0)", c, l)
	}
}

func TestAggregateCountsProblemsNotSubmissions(t *testing.T) {
	at := func(offset int) *time.Time {
		t := time.Now().UTC().AddDate(0, 0, offset)
		return &t
	}
	rows := []rawSubmission{
		// Three tries at 1A, solved on the third.
		{Provider: "codeforces", ProblemRef: "1A", Verdict: "WRONG_ANSWER", Language: "C++17", Runtime: 100, SubmittedAt: at(-3), Difficulty: 1200},
		{Provider: "codeforces", ProblemRef: "1A", Verdict: "TIME_LIMIT_EXCEEDED", Language: "C++17", Runtime: 2000, SubmittedAt: at(-2), Difficulty: 1200},
		{Provider: "codeforces", ProblemRef: "1A", Verdict: "OK", Language: "C++17", Runtime: 120, SubmittedAt: at(-1), Difficulty: 1200},
		// One unsolved problem in a different band.
		{Provider: "codeforces", ProblemRef: "2B", Verdict: "WRONG_ANSWER", Language: "Python 3", Runtime: 500, SubmittedAt: at(-1), Difficulty: 1600},
	}

	st := aggregate("codeforces", rows)

	if st.Submissions != 4 {
		t.Errorf("submissions = %d, want 4", st.Submissions)
	}
	if st.Accepted != 1 {
		t.Errorf("accepted = %d, want 1", st.Accepted)
	}
	if st.Solved != 1 {
		t.Errorf("solved = %d, want 1 distinct problem", st.Solved)
	}
	if st.Attempted != 2 {
		t.Errorf("attempted = %d, want 2 distinct problems", st.Attempted)
	}
	// Accuracy is per submission, solve rate is per problem. Mixing the two is
	// what made the old "success rate" card meaningless.
	if got := st.Accuracy; got < 24.9 || got > 25.1 {
		t.Errorf("accuracy = %.2f, want 25", got)
	}
	if got := st.SolveRate; got < 49.9 || got > 50.1 {
		t.Errorf("solveRate = %.2f, want 50", got)
	}
	if st.AvgRuntime != (100+2000+120+500)/4 {
		t.Errorf("avgRuntime = %d, want %d", st.AvgRuntime, (100+2000+120+500)/4)
	}

	if len(st.Difficulty) != 2 {
		t.Fatalf("difficulty buckets = %d, want 2", len(st.Difficulty))
	}
	if st.Difficulty[0].Bucket != "1200-1399" || st.Difficulty[0].Total != 1 || st.Difficulty[0].Solved != 1 {
		t.Errorf("first bucket = %+v, want 1200-1399 with 1/1", st.Difficulty[0])
	}
	if st.Difficulty[1].Bucket != "1600-1799" || st.Difficulty[1].Solved != 0 {
		t.Errorf("second bucket = %+v, want 1600-1799 unsolved", st.Difficulty[1])
	}

	// AC must lead the verdict list regardless of insertion order.
	if len(st.Verdicts) == 0 || st.Verdicts[0].Verdict != VerdictAC {
		t.Errorf("verdicts = %+v, want AC first", st.Verdicts)
	}
	if len(st.Languages) != 2 || st.Languages[0].Language != "C++17" {
		t.Errorf("languages = %+v, want C++17 most used", st.Languages)
	}
}
