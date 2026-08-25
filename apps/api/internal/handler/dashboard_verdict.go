package handler

// Verdict vocabularies differ per judge: Codeforces says OK /
// WRONG_ANSWER / TIME_LIMIT_EXCEEDED, TLX says AC / WA / TLE. Comparing
// providers side by side is impossible until both are mapped onto one set, so
// every aggregate in the dashboard goes through normalizeVerdict first.

import (
	"strconv"
	"strings"
)

// Canonical verdicts used across the dashboard.
const (
	VerdictAC    = "AC"
	VerdictWA    = "WA"
	VerdictTLE   = "TLE"
	VerdictRTE   = "RTE"
	VerdictCE    = "CE"
	VerdictMLE   = "MLE"
	VerdictPart  = "PARTIAL"
	VerdictPend  = "PENDING"
	VerdictOther = "OTHER"
)

// VerdictOrder is the display order — accepted first, unfinished last.
var VerdictOrder = []string{
	VerdictAC, VerdictPart, VerdictWA, VerdictTLE, VerdictMLE,
	VerdictRTE, VerdictCE, VerdictPend, VerdictOther,
}

func normalizeVerdict(raw string) string {
	v := strings.ToUpper(strings.TrimSpace(raw))
	if v == "" {
		return VerdictPend
	}
	switch v {
	case "OK", "AC", "ACCEPTED":
		return VerdictAC
	case "WA", "WRONG_ANSWER", "WRONGANSWER":
		return VerdictWA
	case "TLE", "TIME_LIMIT_EXCEEDED":
		return VerdictTLE
	case "MLE", "MEMORY_LIMIT_EXCEEDED", "IDLENESS_LIMIT_EXCEEDED":
		return VerdictMLE
	case "RTE", "RE", "RUNTIME_ERROR":
		return VerdictRTE
	case "CE", "COMPILATION_ERROR":
		return VerdictCE
	case "PARTIAL", "PARTIALLY_CORRECT", "PAC":
		return VerdictPart
	case "PENDING", "TESTING", "PND", "?", "IN_QUEUE":
		return VerdictPend
	case "SKI", "SKIPPED", "CHALLENGED", "REJECTED", "ERR":
		return VerdictOther
	}
	// Long-form CF verdicts not enumerated above still carry their shape.
	switch {
	case strings.Contains(v, "WRONG"):
		return VerdictWA
	case strings.Contains(v, "TIME"):
		return VerdictTLE
	case strings.Contains(v, "MEMORY"):
		return VerdictMLE
	case strings.Contains(v, "RUNTIME"):
		return VerdictRTE
	case strings.Contains(v, "COMPIL"):
		return VerdictCE
	case strings.Contains(v, "PARTIAL"):
		return VerdictPart
	}
	return VerdictOther
}

// isAccepted reports whether a raw provider verdict means "solved".
func isAccepted(raw string) bool { return normalizeVerdict(raw) == VerdictAC }

// ratingBucket groups a Codeforces difficulty into the 200-wide bands the
// problemset itself uses. Unrated problems get their own bucket rather than
// being silently counted as 0.
func ratingBucket(rating int) string {
	if rating <= 0 {
		return "unrated"
	}
	if rating < 800 {
		return "<800"
	}
	if rating >= 3000 {
		return "3000+"
	}
	lo := (rating / 200) * 200
	return strconv.Itoa(lo) + "-" + strconv.Itoa(lo+199)
}
