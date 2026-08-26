package cloudflare

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

func boolPtr(b bool) *bool { return &b }

func TestPickBrowserRespectsFilter(t *testing.T) {
	for i := 0; i < 20; i++ {
		b := PickBrowser(BrowserFilter{Browser: "firefox", Platform: "linux"})
		ua := b.Headers["User-Agent"]
		if b.Name != "firefox" || !strings.Contains(ua, "Firefox") || !strings.Contains(ua, "Linux") {
			t.Fatalf("filter ignored: name=%s ua=%q", b.Name, ua)
		}
		if _, hinted := b.Headers["sec-ch-ua"]; hinted {
			t.Fatal("firefox profile must not carry Chrome client hints")
		}
	}
	// Mobile Chrome has to say so in the client hint, or the hint contradicts the
	// User-Agent it travels with.
	m := PickBrowser(BrowserFilter{Browser: "chrome", Platform: "android", Desktop: boolPtr(false)})
	if m.Headers["sec-ch-ua-mobile"] != "?1" || !strings.Contains(m.Headers["User-Agent"], "Mobile") {
		t.Fatalf("android chrome profile wrong: %v", m.Headers)
	}
	// An impossible filter must still yield a usable client.
	if got := PickBrowser(BrowserFilter{Platform: "plan9"}); got.Headers["User-Agent"] == "" {
		t.Fatal("impossible filter should fall back to a working profile")
	}
	if got := PickBrowser(BrowserFilter{Custom: "ScraperBot/1.0"}); got.Headers["User-Agent"] != "ScraperBot/1.0" {
		t.Fatalf("custom User-Agent ignored: %q", got.Headers["User-Agent"])
	}
}

func TestProxyManagerRotationAndBans(t *testing.T) {
	m := NewProxyManager([]string{"1.1.1.1:8080", "http://2.2.2.2:8080", "not a url"}, Sequential, 50*time.Millisecond)
	if m.Empty() {
		t.Fatal("pool should not be empty")
	}
	// A bare host:port is read as http, matching cloudscraper.
	first, second := m.Next(), m.Next()
	if first.String() != "http://1.1.1.1:8080" || second.String() != "http://2.2.2.2:8080" {
		t.Fatalf("sequential order wrong: %v then %v", first, second)
	}
	if got := m.Next(); got.String() != first.String() {
		t.Fatalf("sequential should wrap around, got %v", got)
	}

	m.ReportFailure(first)
	if got := m.Next(); got.String() == first.String() {
		t.Fatal("a failed proxy must be benched")
	}
	time.Sleep(60 * time.Millisecond)
	var sawFirst bool
	for i := 0; i < 4 && !sawFirst; i++ {
		sawFirst = m.Next().String() == first.String()
	}
	if !sawFirst {
		t.Fatal("ban should expire after ProxyBanTime")
	}

	// Smart prefers the proxy that has actually been working.
	smart := NewProxyManager([]string{"1.1.1.1:1", "2.2.2.2:2"}, Smart, time.Minute)
	good, _ := url.Parse("http://2.2.2.2:2")
	bad, _ := url.Parse("http://1.1.1.1:1")
	for i := 0; i < 3; i++ {
		smart.ReportSuccess(good)
	}
	smart.ReportFailure(bad)
	smart.ReportSuccess(bad) // clears the ban, keeps the poor ratio
	if got := smart.Next(); got.String() != good.String() {
		t.Fatalf("smart picked %v, want the proxy with the better record", got)
	}
	if m.Last() == nil {
		t.Fatal("Last should report the proxy handed out most recently")
	}
	if (*ProxyManager)(nil).Next() != nil || !(*ProxyManager)(nil).Empty() {
		t.Fatal("a nil manager must be usable as an empty pool")
	}
}

func TestStealthDelaySkipsFirstRequest(t *testing.T) {
	s := newStealth(StealthOptions{MinDelay: 120 * time.Millisecond, MaxDelay: 140 * time.Millisecond})
	start := time.Now()
	s.delay(nil)
	if elapsed := time.Since(start); elapsed > 50*time.Millisecond {
		t.Fatalf("first request waited %v — a browser does not pause before the first page", elapsed)
	}
	start = time.Now()
	s.delay(nil)
	if elapsed := time.Since(start); elapsed < 100*time.Millisecond {
		t.Fatalf("second request waited %v, want at least the minimum delay", elapsed)
	}

	off := newStealth(StealthOptions{Disabled: true, MinDelay: time.Second, MaxDelay: time.Second})
	start = time.Now()
	off.delay(nil)
	off.delay(nil)
	if elapsed := time.Since(start); elapsed > 50*time.Millisecond {
		t.Fatalf("disabled stealth still slept %v", elapsed)
	}
}

func TestStealthHeadersDoNotOverrideProfile(t *testing.T) {
	s := newStealth(StealthOptions{})
	req, _ := http.NewRequest(http.MethodGet, "https://example.com", nil)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Accept-Language", "id-ID")
	s.apply(req)
	if req.Header.Get("Accept") != "application/json" || req.Header.Get("Accept-Language") != "id-ID" {
		t.Fatal("stealth must not overwrite headers the caller set")
	}

	bare, _ := http.NewRequest(http.MethodGet, "https://example.com", nil)
	s.apply(bare)
	if bare.Header.Get("Accept") == "" || bare.Header.Get("Accept-Language") == "" {
		t.Fatal("stealth should fill in the varying headers when they are absent")
	}
}

func TestTokensHeaderAndExtraction(t *testing.T) {
	c, err := New(Options{Browser: Chrome})
	if err != nil {
		t.Fatal(err)
	}
	u, _ := url.Parse("https://example.com/")
	c.Jar().SetCookies(u, []*http.Cookie{
		{Name: "cf_clearance", Value: "clear", Path: "/"},
		{Name: "__cf_bm", Value: "bm", Path: "/"},
		{Name: "JSESSIONID", Value: "site-session", Path: "/"},
	})
	tokens := c.Tokens(u)
	if tokens.Cookies["cf_clearance"] != "clear" || tokens.Cookies["__cf_bm"] != "bm" {
		t.Fatalf("cloudflare cookies not collected: %v", tokens.Cookies)
	}
	if _, leaked := tokens.Cookies["JSESSIONID"]; leaked {
		t.Fatal("the site's own session cookie must not be reported as a cloudflare token")
	}
	if got := tokens.Header(); got != "__cf_bm=bm; cf_clearance=clear" {
		t.Fatalf("Header() = %q", got)
	}
	if tokens.UserAgent != Chrome.Headers["User-Agent"] {
		t.Fatal("tokens must carry the User-Agent that earned them")
	}
}

func TestTwoCaptchaSolve(t *testing.T) {
	var polls int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r.ParseForm()
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/in.php":
			if r.Form.Get("method") != "turnstile" || r.Form.Get("sitekey") != "0xSITEKEY" {
				http.Error(w, "wrong job payload", http.StatusBadRequest)
				return
			}
			json.NewEncoder(w).Encode(twoCaptchaReply{Status: 1, Request: "job-1"})
		case "/res.php":
			polls++
			if polls < 2 {
				json.NewEncoder(w).Encode(twoCaptchaReply{Status: 0, Request: "CAPCHA_NOT_READY"})
				return
			}
			json.NewEncoder(w).Encode(twoCaptchaReply{Status: 1, Request: "token-abc"})
		}
	}))
	defer srv.Close()

	p := &twoCaptcha{opts: CaptchaOptions{APIKey: "k", PollInterval: 5 * time.Millisecond}, base: srv.URL}
	token, err := p.Solve(context.Background(), TurnstileCaptcha, "https://site.test/", "0xSITEKEY")
	if err != nil {
		t.Fatalf("Solve: %v", err)
	}
	if token != "token-abc" || polls != 2 {
		t.Fatalf("token=%q polls=%d — NOT_READY must be waited out, not treated as failure", token, polls)
	}
}

func TestAntiCaptchaSolveAndErrors(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			Task struct{ Type string } `json:"task"`
		}
		json.NewDecoder(r.Body).Decode(&in)
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/createTask" {
			if in.Task.Type != "TurnstileTaskProxyless" {
				json.NewEncoder(w).Encode(antiCaptchaReply{ErrorID: 1, ErrorDescription: "wrong task type"})
				return
			}
			json.NewEncoder(w).Encode(antiCaptchaReply{TaskID: 7})
			return
		}
		reply := antiCaptchaReply{Status: "ready"}
		reply.Solution.Token = "token-xyz"
		json.NewEncoder(w).Encode(reply)
	}))
	defer srv.Close()

	p := &antiCaptcha{opts: CaptchaOptions{ClientKey: "k", PollInterval: 5 * time.Millisecond}, base: srv.URL}
	token, err := p.Solve(context.Background(), TurnstileCaptcha, "https://site.test/", "0xKEY")
	if err != nil || token != "token-xyz" {
		t.Fatalf("Solve() = %q, %v", token, err)
	}
	if _, err := p.Solve(context.Background(), "sudoku", "https://site.test/", "0xKEY"); err == nil {
		t.Error("an unsupported captcha kind must be refused, not sent to the service")
	}
}

func TestCaptchaProviderRegistry(t *testing.T) {
	if p, err := NewCaptchaProvider(CaptchaOptions{}); p != nil || err != nil {
		t.Fatal("no provider configured should be a nil provider, not an error")
	}
	if _, err := NewCaptchaProvider(CaptchaOptions{Provider: "2captcha"}); err == nil {
		t.Error("2captcha without an api key must be rejected at construction")
	}
	if _, err := NewCaptchaProvider(CaptchaOptions{Provider: "nosuchservice", APIKey: "k"}); err == nil {
		t.Error("an unknown provider name must be an error, not a silent no-op")
	}
	p, err := NewCaptchaProvider(CaptchaOptions{Provider: "return_response"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := p.Solve(context.Background(), TurnstileCaptcha, "u", "k"); err != ErrReturnResponse {
		t.Errorf("return_response should report ErrReturnResponse, got %v", err)
	}
}
