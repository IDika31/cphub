package codeforces

import (
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
)

// probe fetches a path through the already-unlocked session and describes what came
// back, so the mirror's real surface is measured instead of assumed.
func probe(t *testing.T, s *WebSession, path string) string {
	t.Helper()
	req, err := http.NewRequest(http.MethodGet, s.Host()+path, nil)
	if err != nil {
		return "request error"
	}
	setBrowserHeaders(req)
	resp, err := s.http.Do(req)
	if err != nil {
		return "ERR " + err.Error()
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	body := string(raw)

	marks := []string{}
	switch {
	case strings.Contains(body, browserCheckMarker):
		marks = append(marks, "CHALLENGE")
	case strings.Contains(body, "problem-statement"):
		marks = append(marks, "STATEMENT")
	}
	if strings.Contains(body, `name="programTypeId"`) {
		marks = append(marks, "SUBMIT-FORM")
	}
	if strings.Contains(body, `name="handleOrEmail"`) {
		marks = append(marks, "LOGIN-FORM")
	}
	if strings.Contains(body, "status-frame-datatable") {
		marks = append(marks, "SUBMISSION-TABLE")
	}
	if strings.Contains(body, "datatable") && strings.Contains(body, "contest") {
		marks = append(marks, "TABLE")
	}
	if csrfRe.MatchString(body) {
		marks = append(marks, "CSRF")
	}
	if strings.Contains(body, "Codeforces") {
		marks = append(marks, "CF-SHELL")
	}
	// Problem 4A is "Watermelon". Its title appearing is the only proof that a page
	// really is the problem rather than the login page wearing the same byte count.
	if strings.Contains(body, "Watermelon") {
		marks = append(marks, "REAL-4A")
	}
	if len(marks) == 0 {
		marks = append(marks, "unrecognised")
	}
	t.Logf("%-40s %3d %6db  %s", path, resp.StatusCode, len(body), strings.Join(marks, " "))
	return strings.Join(marks, " ")
}

// TestLiveMirrorSurface measures which parts of Codeforces the m1/m3 mirrors serve.
// The worry it answers is real: mirrors exist for live contests, so the archive and
// the action pages might not be there at all. Gated by CF_LIVE.
func TestLiveMirrorSurface(t *testing.T) {
	if os.Getenv("CF_LIVE") == "" {
		t.Skip("set CF_LIVE=1 to probe the real Codeforces mirror")
	}
	s, err := NewWebSession()
	if err != nil {
		t.Fatal(err)
	}
	// Unlock once; the pow cookie is good for 24 hours across every path.
	if _, err := s.get("/enter"); err != nil {
		t.Fatalf("unlock: %v", err)
	}

	t.Log("PATH                                    HTTP  BYTES  MARKERS")
	statement := probe(t, s, "/problemset/problem/4/A")
	probe(t, s, "/contest/4/problem/A")
	submit := probe(t, s, "/contest/4/submit")
	probe(t, s, "/problemset/page/1")
	probe(t, s, "/contests")
	probe(t, s, "/submissions/tourist")
	probe(t, s, "/contestRegistration/2257")
	probe(t, s, "/api/user.info?handles=tourist")

	// What CPHub actually depends on: an unauthenticated visit to a submit page must
	// still be Codeforces asking us to log in, not a mirror that has no such page.
	if !strings.Contains(submit, "LOGIN-FORM") && !strings.Contains(submit, "SUBMIT-FORM") {
		t.Errorf("submit page markers = %q — the mirror may not serve it at all", submit)
	}
	if !strings.Contains(statement, "STATEMENT") {
		t.Logf("NOTE: statement not served for an archived problem (markers %q)", statement)
	}
}
