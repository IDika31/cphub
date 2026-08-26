package cloudflare

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
)

// turnstilePage is shaped like a Turnstile interstitial: a site key, a form to post
// back, and a hidden field that has to survive the round trip.
const turnstilePage = `<html><head><title>Just a moment...</title></head><body>
<form id="challenge-form" action="/verify" method="POST">
<input type="hidden" name="md" value="MD-VALUE"/>
<div class="cf-turnstile" data-sitekey="0xAAAAAAAAAAAAAAAAAAAAAA"></div>
<input name="cf-turnstile-response"/>
</form>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script>
</body></html>`

type recordingProvider struct {
	mu      sync.Mutex
	calls   int
	kind    CaptchaKind
	siteKey string
	pageURL string
}

func (p *recordingProvider) Name() string { return "test-provider" }

func (p *recordingProvider) Solve(_ context.Context, kind CaptchaKind, pageURL, siteKey string) (string, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.calls++
	p.kind, p.siteKey, p.pageURL = kind, siteKey, pageURL
	return "token-1", nil
}

// TestTurnstileGateThroughProvider walks cloudscraper's Turnstile path: detect the
// widget, buy a token, replay the form with it, come back with clearance.
func TestTurnstileGateThroughProvider(t *testing.T) {
	var submitted url.Values
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Server", "cloudflare")
		w.Header().Set("cf-ray", "ray-turnstile")
		if r.URL.Path == "/verify" {
			r.ParseForm()
			submitted = r.PostForm
			http.SetCookie(w, &http.Cookie{Name: "cf_clearance", Value: "granted", Path: "/"})
			http.Redirect(w, r, "/", http.StatusFound)
			return
		}
		if ck, err := r.Cookie("cf_clearance"); err == nil && ck.Value == "granted" {
			w.Write([]byte(realPage))
			return
		}
		w.WriteHeader(http.StatusForbidden)
		w.Write([]byte(turnstilePage))
	}))
	defer srv.Close()

	provider := &recordingProvider{}
	c, err := New(Options{CaptchaProvider: provider, Stealth: StealthOptions{Disabled: true}})
	if err != nil {
		t.Fatal(err)
	}
	body, err := c.Get(context.Background(), srv.URL+"/")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if !strings.Contains(body, "Watermelon") {
		t.Fatalf("expected the real page, got %.100q", body)
	}
	if provider.calls != 1 || provider.kind != TurnstileCaptcha || provider.siteKey != "0xAAAAAAAAAAAAAAAAAAAAAA" {
		t.Fatalf("provider called wrong: calls=%d kind=%s key=%s", provider.calls, provider.kind, provider.siteKey)
	}
	if submitted.Get("cf-turnstile-response") != "token-1" {
		t.Errorf("token not submitted: %v", submitted)
	}
	if submitted.Get("md") != "MD-VALUE" {
		t.Errorf("the form's own hidden field was not replayed: %v", submitted)
	}
}

// TestTurnstileWithoutProvider pins the failure mode: no provider means an error
// that names the gate, not a silent empty page.
func TestTurnstileWithoutProvider(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Server", "cloudflare")
		w.WriteHeader(http.StatusForbidden)
		w.Write([]byte(turnstilePage))
	}))
	defer srv.Close()

	c, err := New(Options{MaxAttempts: 1, Stealth: StealthOptions{Disabled: true}, NoAutoRefreshOn403: true})
	if err != nil {
		t.Fatal(err)
	}
	_, err = c.Get(context.Background(), srv.URL+"/")
	var chErr *ChallengeError
	if !errors.As(err, &chErr) || chErr.Kind != Turnstile {
		t.Fatalf("want a Turnstile ChallengeError, got %v", err)
	}
	if !errors.Is(err, ErrNeedsBrowser) || !strings.Contains(err.Error(), "captcha provider") {
		t.Fatalf("error should say what is missing: %v", err)
	}
}

// TestSession403Recovery covers the v3.0.0 headline feature: a 403 from a session
// that has gone stale triggers a refresh — cookies cleared, fingerprint rotated,
// origin re-opened — and the request is retried once the origin answers.
func TestSession403Recovery(t *testing.T) {
	var (
		mu         sync.Mutex
		originHits int
		refreshed  bool
	)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		if r.URL.Path == "/" {
			originHits++
			refreshed = true
		}
		allowed := refreshed
		mu.Unlock()

		w.Header().Set("Server", "cloudflare")
		if r.URL.Path == "/" {
			w.Write([]byte("origin ok"))
			return
		}
		if allowed {
			w.Write([]byte(realPage))
			return
		}
		w.WriteHeader(http.StatusForbidden)
		w.Write([]byte("<html>plain forbidden, no challenge markers</html>"))
	}))
	defer srv.Close()

	c, err := New(Options{Stealth: StealthOptions{Disabled: true}, MaxAttempts: 1})
	if err != nil {
		t.Fatal(err)
	}
	// A clearance cookie from the dead session must not survive the refresh.
	u, _ := url.Parse(srv.URL + "/")
	c.Jar().SetCookies(u, []*http.Cookie{{Name: "cf_clearance", Value: "stale", Path: "/"}})

	body, err := c.Get(context.Background(), srv.URL+"/protected")
	if err != nil {
		t.Fatalf("Get after recovery: %v", err)
	}
	if !strings.Contains(body, "Watermelon") {
		t.Fatalf("recovery did not reach the real page: %.80q", body)
	}
	mu.Lock()
	hits := originHits
	mu.Unlock()
	if hits != 1 {
		t.Errorf("origin probed %d times, want exactly 1 refresh", hits)
	}
	if tokens := c.Tokens(u); tokens.Cookies["cf_clearance"] == "stale" {
		t.Error("the stale clearance cookie survived the refresh")
	}
}

// TestSession403RecoveryIsBounded makes sure a permanently 403'd path cannot loop.
func TestSession403RecoveryIsBounded(t *testing.T) {
	var mu sync.Mutex
	origin := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Server", "cloudflare")
		if r.URL.Path == "/" {
			mu.Lock()
			origin++
			mu.Unlock()
			w.Write([]byte("origin ok"))
			return
		}
		w.WriteHeader(http.StatusForbidden)
		w.Write([]byte("<html>always forbidden</html>"))
	}))
	defer srv.Close()

	c, err := New(Options{Stealth: StealthOptions{Disabled: true}, MaxAttempts: 1, Max403Retries: 2})
	if err != nil {
		t.Fatal(err)
	}
	req, _ := http.NewRequest(http.MethodGet, srv.URL+"/protected", nil)
	resp, err := c.Do(req)
	if err != nil {
		t.Fatalf("a plain 403 is a result, not a transport error: %v", err)
	}
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("status = %d, want the 403 handed back after retries", resp.StatusCode)
	}
	mu.Lock()
	defer mu.Unlock()
	if origin != 2 {
		t.Fatalf("origin probed %d times, want Max403Retries (2)", origin)
	}
}
