package cloudflare

import (
	"context"
	"errors"
	"os"
	"strings"
	"testing"
	"time"
)

// TestLiveCodeforces is the diagnostic that decided how CPHub talks to Codeforces,
// kept runnable so the decision can be re-checked instead of remembered. It reports
// what each fingerprint gets from the main host and the two mirrors.
//
// Result on 2026-08-26: codeforces.com answers 403 with a managed challenge to both
// Chrome and Firefox hellos; the mirrors serve their own proof-of-work page, which
// is Codeforces' check and not Cloudflare's. If the main host ever reports
// "no challenge" here, the mirror fallback in provider/codeforces can be retired.
//
// Gated by CF_LIVE, like every other test in this repo that leaves the machine.
func TestLiveCodeforces(t *testing.T) {
	if os.Getenv("CF_LIVE") == "" {
		t.Skip("set CF_LIVE=1 to probe the real Codeforces")
	}
	hosts := []string{"https://codeforces.com", "https://m1.codeforces.com", "https://m3.codeforces.com"}

	for _, browser := range []Browser{Chrome, Firefox} {
		c, err := New(Options{Browser: browser, MaxAttempts: 2, Timeout: 40 * time.Second})
		if err != nil {
			t.Fatal(err)
		}
		for _, host := range hosts {
			ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
			body, err := c.Get(ctx, host+"/enter")
			cancel()

			var chErr *ChallengeError
			switch {
			case err == nil:
				t.Logf("%-8s %-26s OK  %6db  %s", browser.Name, host, len(body), describe(body))
			case errors.As(err, &chErr):
				t.Logf("%-8s %-26s %s (HTTP %d, ray %s)", browser.Name, host, chErr.Kind, chErr.Status, chErr.RayID)
			default:
				// A transport error is worth seeing, but it is not a verdict about
				// Cloudflare, so it must not read like one.
				t.Logf("%-8s %-26s transport error: %v", browser.Name, host, err)
			}
			if err != nil && !errors.As(err, &chErr) && strings.Contains(err.Error(), "cloudflare") {
				t.Errorf("a cloudflare verdict must arrive as *ChallengeError, got %T", err)
			}
		}
	}
}

// describe names what a successfully fetched page actually is, so "OK" in the log
// above cannot be mistaken for "we are logged in".
func describe(body string) string {
	switch {
	case strings.Contains(body, "browser is being checked"):
		return "codeforces proof-of-work page"
	case strings.Contains(body, `name="handleOrEmail"`):
		return "real login page"
	case strings.Contains(body, "problem-statement"):
		return "problem statement"
	}
	return "unrecognised page"
}
