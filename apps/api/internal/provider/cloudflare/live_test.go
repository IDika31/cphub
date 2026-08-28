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

// TestLiveBrowserSolver is the counterpart to TestLiveCodeforces: it asks whether
// the headless browser actually gets past the managed challenge that defeats every
// fingerprint above, and whether the clearance it earns is replayable by the utls
// client afterwards. That second half is the one that matters — a solve that only
// works inside the browser buys nothing.
//
// The pages fetched are the two the mirrors cannot serve at all (a problemset
// statement and the contest list), so a pass here is exactly the "whole site
// works" claim, not just "the login page loads".
func TestLiveBrowserSolver(t *testing.T) {
	if os.Getenv("CF_LIVE") == "" {
		t.Skip("set CF_LIVE=1 to probe the real Codeforces")
	}
	path, err := FindBrowser()
	if err != nil {
		t.Skipf("no browser to test with: %v", err)
	}
	t.Logf("browser: %s", path)

	solver, err := NewBrowserSolver(BrowserOptions{Path: path, Timeout: 90 * time.Second})
	if err != nil {
		t.Fatal(err)
	}
	c, err := New(Options{
		Solver:              solver,
		MaxAttempts:         3,
		Timeout:             60 * time.Second,
		Stealth:             StealthOptions{NoHumanLikeDelays: true, NoRandomizeHeaders: true},
		NoRotateFingerprint: true,
	})
	if err != nil {
		t.Fatal(err)
	}

	for _, target := range []string{
		"https://codeforces.com/problemset/problem/4/A",
		"https://codeforces.com/contests",
	} {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
		body, err := c.Get(ctx, target)
		cancel()
		if err != nil {
			t.Fatalf("%s: %v", target, err)
		}
		t.Logf("%-52s OK %7db  %s", target, len(body), describe(body))
		if Classify(200, nil, body) != NoChallenge {
			t.Errorf("%s: still a challenge page after solving", target)
		}
	}
	// The solve must hand back the User-Agent it used, or the clearance cookie it
	// earned cannot be replayed by anything else.
	if ua := solver.UserAgent(); ua == "" {
		t.Error("solver reported no User-Agent")
	} else {
		t.Logf("clearance UA: %s", ua)
	}
}
