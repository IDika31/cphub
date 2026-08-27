package codeforces

import (
	"crypto/sha1"
	"encoding/hex"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/IDika31/cphub/api/internal/provider/cloudflare"
)

// Golden vectors captured from Codeforces' own browser-check script: each salt is one the server
// handed out, and the counter is what the browser check itself settled on. They
// pin the Go solver to the same answer the site expects — hash function, input
// shape and prefix all at once.
func TestSolvePOWMatchesTheBrowserCheck(t *testing.T) {
	vectors := map[string]string{
		"42bcaaa019ee532354bc": "32698",
		"fc6a4555bda3b0e2aa40": "55911",
		"50703d8317f008def270": "61068",
		"3a4397a0c9d88307c814": "134068",
	}
	for salt, wantCounter := range vectors {
		got, err := solvePOW(salt)
		if err != nil {
			t.Fatalf("solvePOW(%s): %v", salt, err)
		}
		want := wantCounter + "_" + salt
		if got != want {
			t.Errorf("solvePOW(%s) = %q, want %q", salt, got, want)
		}
		sum := sha1.Sum([]byte(got))
		if !strings.HasPrefix(hex.EncodeToString(sum[:]), powPrefix) {
			t.Errorf("sha1(%q) does not start with %q", got, powPrefix)
		}
	}
}

func newTestSession(t *testing.T, srv *httptest.Server) *WebSession {
	t.Helper()
	jar, err := cookiejar.New(nil)
	if err != nil {
		t.Fatal(err)
	}
	return &WebSession{
		http:  &http.Client{Jar: jar, Timeout: 10 * time.Second},
		jar:   jar,
		hosts: []string{srv.URL},
		host:  srv.URL,
	}
}

// Codeforces hands out a salt with the challenge and only serves the real page once
// the solved cookie comes back on the same session. Sending the answer without the
// session cookie earns a fresh puzzle instead — that mistake cost a debugging round
// against the live site, so the stub reproduces it.
func TestGetSolvesBrowserCheck(t *testing.T) {
	const salt = "42bcaaa019ee532354bc"
	var served int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		served++
		session, _ := r.Cookie("JSESSIONID")
		pow, _ := r.Cookie("pow")
		if session == nil {
			http.SetCookie(w, &http.Cookie{Name: "JSESSIONID", Value: "ABC", Path: "/"})
		}
		solved := pow != nil && strings.HasPrefix(pow.Value, "32698_")
		if !solved || session == nil {
			http.SetCookie(w, &http.Cookie{Name: "pow", Value: salt, Path: "/"})
			w.Write([]byte(`<p>Please wait. Your browser is being checked.</p><script>x</script>`))
			return
		}
		w.Write([]byte(`<html><script>var csrf='d2428ca21c8b65cd070fea259cda2610';</script>` +
			`<input name="handleOrEmail"><input name="password"></html>`))
	}))
	defer srv.Close()

	s := newTestSession(t, srv)
	body, err := s.get("/enter")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if strings.Contains(body, browserCheckMarker) {
		t.Fatal("still on the browser check after get()")
	}
	m := csrfRe.FindStringSubmatch(body)
	if m == nil {
		t.Fatal("csrf not found in the unlocked page")
	}
	if m[1] != "d2428ca21c8b65cd070fea259cda2610" {
		t.Errorf("csrf = %q", m[1])
	}
	if served != 2 {
		t.Errorf("served %d requests, want 2 (challenge, then the page)", served)
	}
}

func TestGetFailsLoudlyWhenChallengeHasNoSalt(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`<p>Your browser is being checked.</p>`))
	}))
	defer srv.Close()

	s := newTestSession(t, srv)
	_, err := s.get("/enter")
	if err == nil || !strings.Contains(err.Error(), "pow cookie") {
		t.Fatalf("err = %v, want a complaint about the missing pow cookie", err)
	}
}

func TestExportImportRoundTrip(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	defer srv.Close()

	s := newTestSession(t, srv)
	s.ftaa, s.bfaa, s.handle = "abc123", bfaaConstant, "IDika31"
	u, _ := url.Parse(srv.URL)
	s.jar.SetCookies(u, []*http.Cookie{{Name: "JSESSIONID", Value: "XYZ", Path: "/"}})

	blob, err := s.Export()
	if err != nil {
		t.Fatalf("Export: %v", err)
	}

	restored := newTestSession(t, srv)
	if err := restored.Import(blob); err != nil {
		t.Fatalf("Import: %v", err)
	}
	if restored.ftaa != "abc123" || restored.handle != "IDika31" || restored.bfaa != bfaaConstant {
		t.Errorf("restored ftaa/handle/bfaa = %q/%q/%q", restored.ftaa, restored.handle, restored.bfaa)
	}
	found := false
	for _, ck := range restored.jar.Cookies(u) {
		if ck.Name == "JSESSIONID" && ck.Value == "XYZ" {
			found = true
		}
	}
	if !found {
		t.Error("JSESSIONID did not survive the round trip")
	}
}

// TestLiveLoginPageReachable proves the whole transport against the real site without
// credentials: clear Cloudflare, land on the actual login page, find the csrf token.
//
// The re-navigation matters and is the point of the test. Clearing the challenge on
// /enter drops the browser on / rather than back on /enter, so a client that asks once
// and inspects what it gets is looking at the front page and concludes there is no
// login form. Asking again — now holding clearance — is what actually reaches it.
//
// Gated by CF_LIVE so the normal suite stays offline.
func TestLiveLoginPageReachable(t *testing.T) {
	if os.Getenv("CF_LIVE") == "" {
		t.Skip("set CF_LIVE=1 to hit the real Codeforces")
	}
	t.Cleanup(DisableBrowserSolver)
	if _, err := EnableBrowserSolver(cloudflare.BrowserOptions{}); err != nil {
		t.Skipf("no browser to test with: %v", err)
	}
	s, err := NewWebSession()
	if err != nil {
		t.Fatal(err)
	}
	started := time.Now()
	body, err := s.get("/enter")
	if err != nil {
		t.Fatalf("live get /enter: %v", err)
	}
	if strings.Contains(body, browserCheckMarker) {
		t.Fatal("browser check not cleared")
	}
	if !strings.HasPrefix(s.Host(), "https://codeforces.com") {
		t.Fatalf("answered by %s, wanted the main host", s.Host())
	}
	if !strings.Contains(body, `name="handleOrEmail"`) {
		t.Fatalf("no login form on the page /enter returned (%d bytes) — the clearance redirect probably left us on the front page", len(body))
	}
	m := csrfRe.FindStringSubmatch(body)
	if m == nil {
		t.Fatalf("no csrf token on the live login page (%d bytes)", len(body))
	}
	t.Logf("%s /enter reached in %s, csrf=%s…", s.Host(), time.Since(started).Round(time.Millisecond), m[1][:8])
}

// The shape of a real logged-in codeforces.com page, measured 2026-08-27 via
// TestLiveCodeforcesLoginGate: no .enter-or-register-box (that is the logged-OUT
// header), the account's own handle beside the logout link, and rated users listed
// further down the sidebar.
const loggedInPage = `<div id="header">
  <div class="lang-chooser">
    <div><a href="/profile/IDika">IDika</a> | <a href="/logout">Logout</a></div>
  </div>
</div>
<div class="sidebar">
  <div class="rated-users"><a href="/profile/Benq">Benq</a></div>
  <div class="rated-users"><a href="/profile/jiangly">jiangly</a></div>
</div>`

func TestLoggedInHandleAnchorsOnLogout(t *testing.T) {
	if got := loggedInHandle(loggedInPage); got != "IDika" {
		t.Errorf("loggedInHandle = %q, want %q", got, "IDika")
	}
}

// The regression this guards: with the sidebar rendered BEFORE the header, a rule that
// takes the first /profile/ link in the body reports someone else's handle and links
// the wrong Codeforces account. Anchoring on the logout link is what makes the order
// irrelevant.
func TestLoggedInHandleIgnoresSidebarUsers(t *testing.T) {
	reordered := `<div class="sidebar">
  <div class="rated-users"><a href="/profile/Benq">Benq</a></div>
  <div class="rated-users"><a href="/profile/jiangly">jiangly</a></div>
</div>
<div id="header"><div class="lang-chooser">
  <div><a href="/profile/IDika">IDika</a> | <a href="/logout">Logout</a></div>
</div></div>`
	if got := loggedInHandle(reordered); got != "IDika" {
		t.Errorf("loggedInHandle = %q, want %q — the nearest link to the logout anchor", got, "IDika")
	}
}

// No logout link means nobody is signed in, however many profile links the page has.
func TestLoggedInHandleEmptyWhenAnonymous(t *testing.T) {
	anonymous := `<div class="enter-or-register-box"><a href="/enter">Enter</a></div>
<div class="sidebar"><a href="/profile/Benq">Benq</a></div>`
	if got := loggedInHandle(anonymous); got != "" {
		t.Errorf("loggedInHandle = %q, want empty — a sidebar profile link is not a session", got)
	}
}

// The header of a real logged-in codeforces.com page, byte-for-byte as measured
// 2026-08-27. The logout href carries a per-session token before "/logout", which is
// what an earlier `href="/logout` pattern failed to match — so a live session read as
// logged out and every server-side action refused to run.
const loggedInHeaderMainHost = `<div class="lang-chooser">
  <div style="text-align: right;">
    <a href="/profile/IDika">IDika</a> | <a href="/58041edc1b1559849bdbdced8d68f53c/logout">Logout</a>
  </div>
</div>
<div class="sidebar">
  <a href="/profile/Benq">Benq</a><a href="/profile/jiangly">jiangly</a>
</div>`

func TestLoggedInHandleReadsTokenPrefixedLogout(t *testing.T) {
	if got := loggedInHandle(loggedInHeaderMainHost); got != "IDika" {
		t.Errorf("loggedInHandle = %q, want %q — the logout href is /<token>/logout, not /logout", got, "IDika")
	}
}
