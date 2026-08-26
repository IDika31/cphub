package codeforces

import (
	"os"
	"regexp"
	"strings"
	"testing"
)

// TestLiveLoginDiagnostic reports what each host actually answers during a login,
// so a failure can be attributed instead of guessed. It never prints the password
// or the page, only which markers were present.
//
// Run with: CF_LIVE=1 CF_HANDLE=... CF_PASSWORD=... go test -run TestLiveLoginDiagnostic -v
func TestLiveLoginDiagnostic(t *testing.T) {
	handle, password := os.Getenv("CF_HANDLE"), os.Getenv("CF_PASSWORD")
	if os.Getenv("CF_LIVE") == "" || handle == "" || password == "" {
		t.Skip("set CF_LIVE=1, CF_HANDLE and CF_PASSWORD to exercise a real login")
	}

	s, err := NewWebSession()
	if err != nil {
		t.Fatal(err)
	}

	body, err := s.get("/enter")
	if err != nil {
		t.Fatalf("GET /enter failed on every host: %v", err)
	}
	t.Logf("login page: host=%s bytes=%d markers=%s", s.Host(), len(body), pageMarkers(body))
	csrf := csrfRe.FindStringSubmatch(body)
	if csrf == nil {
		t.Fatalf("no csrf token on the login page — the page shape changed")
	}
	t.Logf("csrf token present (%d chars)", len(csrf[1]))

	resp, err := s.postForm("/enter", loginForm(s, csrf[1], handle, password))
	if err != nil {
		t.Fatalf("POST /enter: %v", err)
	}
	t.Logf("login reply: bytes=%d markers=%s", len(resp), pageMarkers(resp))

	if who := loggedInHandle(resp); who != "" {
		t.Logf("SUCCESS: session belongs to %q", who)
		return
	}
	if m := errSpanRe.FindStringSubmatch(resp); m != nil {
		t.Logf("Codeforces error span: %q", strings.TrimSpace(htmlText(m[1])))
	}
	// The two shapes worth telling apart: the form came back (rejected), or the
	// page is something else entirely (shape change, or the mirror refusing auth).
	if strings.Contains(resp, `name="handleOrEmail"`) {
		t.Log("the login form came back — Codeforces rejected the credentials, or wants something more")
	}
	for _, needle := range []string{"Invalid handle", "Invalid password", "captcha", "recaptcha"} {
		if idx := strings.Index(strings.ToLower(resp), strings.ToLower(needle)); idx >= 0 {
			t.Logf("page mentions %q at offset %d, markup around it: %s", needle, idx, window(resp, idx, 260))
		}
	}
	for _, m := range regexp.MustCompile(`(?i)<[a-z]+[^>]*class="[^"]*error[^"]*"[^>]*>`).FindAllString(resp, 4) {
		t.Logf("error-ish element: %s", m)
	}
	t.Fail()
}

// loginForm builds the same payload Login sends, so the diagnostic exercises the
// real thing rather than a lookalike.
func loginForm(s *WebSession, csrf, handle, password string) map[string][]string {
	if s.ftaa == "" {
		s.ftaa = randomLowerAlnum(18)
	}
	s.bfaa = bfaaConstant
	return map[string][]string{
		"csrf_token":    {csrf},
		"action":        {"enter"},
		"ftaa":          {s.ftaa},
		"bfaa":          {s.bfaa},
		"handleOrEmail": {handle},
		"password":      {password},
		"_tta":          {"176"},
		"remember":      {"on"},
	}
}

var titleRe = regexp.MustCompile(`(?is)<title>(.*?)</title>`)

// window returns the markup around an offset, so a regex can be written against
// what Codeforces actually sends rather than what it used to send.
func window(body string, at, span int) string {
	start := at - span/2
	if start < 0 {
		start = 0
	}
	end := at + span/2
	if end > len(body) {
		end = len(body)
	}
	return strings.Join(strings.Fields(body[start:end]), " ")
}

func pageMarkers(body string) string {
	var marks []string
	if m := titleRe.FindStringSubmatch(body); m != nil {
		marks = append(marks, "title="+strings.TrimSpace(m[1]))
	}
	for marker, name := range map[string]string{
		browserCheckMarker:       "POW-CHECK",
		`name="handleOrEmail"`:   "LOGIN-FORM",
		"Just a moment":          "CF-WALL",
		"challenge-platform":     "CF-PLATFORM",
		`name="programTypeId"`:   "SUBMIT-FORM",
		"status-frame-datatable": "SUBMISSIONS",
	} {
		if strings.Contains(body, marker) {
			marks = append(marks, name)
		}
	}
	if csrfRe.MatchString(body) {
		marks = append(marks, "CSRF")
	}
	if who := loggedInHandle(body); who != "" {
		marks = append(marks, "LOGGED-IN-AS-"+who)
	}
	return strings.Join(marks, " ")
}
