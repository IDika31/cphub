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
)

// Golden vectors captured from the mirror's own script: each salt is one the server
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
		hosts: []string{srv.URL},
		host:  srv.URL,
	}
}

// The mirror hands out a salt with the challenge and only serves the real page once
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
	s.http.Jar.SetCookies(u, []*http.Cookie{{Name: "JSESSIONID", Value: "XYZ", Path: "/"}})

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
	for _, ck := range restored.http.Jar.Cookies(u) {
		if ck.Name == "JSESSIONID" && ck.Value == "XYZ" {
			found = true
		}
	}
	if !found {
		t.Error("JSESSIONID did not survive the round trip")
	}
}

// TestLiveMirrorLoginForm proves the whole transport against the real site without
// credentials: solve the mirror's puzzle, reach the actual login page, find the csrf
// token. Gated by CF_LIVE so the normal suite stays offline.
func TestLiveMirrorLoginForm(t *testing.T) {
	if os.Getenv("CF_LIVE") == "" {
		t.Skip("set CF_LIVE=1 to hit the real Codeforces mirror")
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
	m := csrfRe.FindStringSubmatch(body)
	if m == nil {
		t.Fatalf("no csrf token on the live login page (%d bytes)", len(body))
	}
	if !strings.Contains(body, `name="handleOrEmail"`) {
		t.Error("login form field handleOrEmail missing — the page may have changed")
	}
	t.Logf("mirror %s unlocked in %s, csrf=%s…", s.Host(), time.Since(started).Round(time.Millisecond), m[1][:8])
}
