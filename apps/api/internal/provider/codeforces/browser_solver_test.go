package codeforces

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/IDika31/cphub/api/internal/provider/cloudflare"
)

// stubSolver stands in for the headless browser: the cache logic is what is under
// test, not Chromium.
type stubSolver struct {
	cookies []*http.Cookie
	ua      string
}

func (s stubSolver) Solve(context.Context, *url.URL, cloudflare.Challenge, string) ([]*http.Cookie, error) {
	return s.cookies, nil
}

func (s stubSolver) UserAgent() string { return s.ua }

func TestCachingSolverRemembersClearanceAndItsUserAgent(t *testing.T) {
	t.Cleanup(DisableBrowserSolver)
	DisableBrowserSolver()

	solver := cachingSolver{inner: stubSolver{
		ua: "Mozilla/5.0 RealChrome",
		cookies: []*http.Cookie{
			{Name: "__cf_bm", Value: "noise"},
			{Name: "cf_clearance", Value: "earned"},
		},
	}}
	target, _ := url.Parse("https://codeforces.com/enter")
	if _, err := solver.Solve(context.Background(), target, cloudflare.Managed, ""); err != nil {
		t.Fatalf("Solve: %v", err)
	}

	// The point of the cache: the next WebSession seeds this instead of paying for
	// another browser launch, which the production box cannot afford per request.
	value, ua := cachedClearance()
	if value != "earned" {
		t.Errorf("cached clearance = %q, want %q", value, "earned")
	}
	if ua != "Mozilla/5.0 RealChrome" {
		t.Errorf("cached UA = %q, want the browser's own", ua)
	}
}

func TestCachedClearanceRefusesHalfAPair(t *testing.T) {
	t.Cleanup(DisableBrowserSolver)
	DisableBrowserSolver()

	// A solver that cannot say which User-Agent earned the cookie leaves it
	// unusable: Cloudflare binds cf_clearance to the UA, so replaying it under a
	// guessed one is rejected, and seeding it would waste a request to find that out.
	solver := cachingSolver{inner: stubSolver{
		ua:      "",
		cookies: []*http.Cookie{{Name: "cf_clearance", Value: "earned"}},
	}}
	target, _ := url.Parse("https://codeforces.com/enter")
	if _, err := solver.Solve(context.Background(), target, cloudflare.Managed, ""); err != nil {
		t.Fatalf("Solve: %v", err)
	}

	if value, ua := cachedClearance(); value != "" || ua != "" {
		t.Errorf("cachedClearance = (%q, %q), want both empty", value, ua)
	}
}

// A Cloudflare wall and a 404 mean different things, and the wall is the one that
// explains the failure. Reporting "not found" for a page that is there, on a host we
// simply could not reach, sends the user looking for something that exists.
func TestBlockedHostOutranks404(t *testing.T) {
	blocked := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte(`<title>Just a moment...</title>`))
	}))
	defer blocked.Close()
	missing := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer missing.Close()

	s := newTestSession(t, missing)
	s.hosts = []string{blocked.URL, missing.URL}
	s.host = blocked.URL

	_, _, _, err := s.rawGet("/problemset/problem/1/A")
	if err == nil {
		t.Fatal("err = nil: a 404 from a reachable host was reported as the answer")
	}
	if !strings.Contains(err.Error(), "blocked by Cloudflare") {
		t.Errorf("err = %v, want the block named", err)
	}
	if !strings.Contains(err.Error(), "browser solver belum aktif") {
		t.Errorf("err = %v, want it to say what would fix this", err)
	}
}

// The converse still has to hold: when every host really does answer 404, that is
// an answer about the path and must come back as a body the caller can explain.
func TestEveryHost404StaysA404(t *testing.T) {
	missing := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte("nope"))
	}))
	defer missing.Close()

	s := newTestSession(t, missing)
	body, status, _, err := s.rawGet("/contest/999999/submit")
	if err != nil {
		t.Fatalf("err = %v, want a 404 body instead", err)
	}
	if status != http.StatusNotFound {
		t.Errorf("status = %d, want 404", status)
	}
	if body != "nope" {
		t.Errorf("body = %q, want the server's own", body)
	}
}
