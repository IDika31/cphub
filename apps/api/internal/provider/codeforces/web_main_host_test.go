package codeforces

import (
	"os"
	"strings"
	"testing"

	"github.com/IDika31/cphub/api/internal/provider/cloudflare"
)

// TestLiveMainHostSurface is the claim this whole browser-solver path exists to
// make: with a headless browser configured, codeforces.com itself answers — so the
// parts of the site the m1/m3 mirrors return 404 for (the problemset, the archive,
// the contest list) work, not just the live contests.
//
// Every path below was measured as unreachable before the solver (see
// TestLiveMirrorSurface, which records the mirrors answering 404 for exactly these).
// Gated by CF_LIVE, like everything here that leaves the machine.
func TestLiveMainHostSurface(t *testing.T) {
	if os.Getenv("CF_LIVE") == "" {
		t.Skip("set CF_LIVE=1 to probe the real Codeforces")
	}
	t.Cleanup(DisableBrowserSolver)
	path, err := EnableBrowserSolver(cloudflare.BrowserOptions{})
	if err != nil {
		t.Skipf("no browser to test with: %v", err)
	}
	t.Logf("browser: %s", path)

	for _, tc := range []struct {
		path string
		want string
	}{
		{"/problemset/problem/4/A", "problem-statement"},
		{"/problemset", "problemset"},
		{"/contests", "contests"},
	} {
		s, err := NewWebSession()
		if err != nil {
			t.Fatal(err)
		}
		body, status, _, err := s.getPage(tc.path)
		if err != nil {
			t.Errorf("%s: %v", tc.path, err)
			continue
		}
		// Landing on a mirror would mean the main host was skipped, which is the
		// failure this test is here to catch — the mirrors cannot serve these.
		if !strings.HasPrefix(s.Host(), "https://codeforces.com") {
			t.Errorf("%s: answered by %s, wanted the main host", tc.path, s.Host())
		}
		if !strings.Contains(body, tc.want) {
			t.Errorf("%s: HTTP %d, %d bytes, missing %q", tc.path, status, len(body), tc.want)
			continue
		}
		t.Logf("%-28s OK  %s  %7db", tc.path, s.Host(), len(body))
	}
}

// TestLiveScraperFetchesFromMainHost checks the statement path end to end, which is
// what the problem editor actually calls.
func TestLiveScraperFetchesFromMainHost(t *testing.T) {
	if os.Getenv("CF_LIVE") == "" {
		t.Skip("set CF_LIVE=1 to probe the real Codeforces")
	}
	t.Cleanup(DisableBrowserSolver)
	if _, err := EnableBrowserSolver(cloudflare.BrowserOptions{}); err != nil {
		t.Skipf("no browser to test with: %v", err)
	}

	problem, err := NewScraper().FetchProblem("4", "a")
	if err != nil {
		t.Fatalf("FetchProblem: %v", err)
	}
	if problem.ProblemID != "4A" {
		t.Errorf("ProblemID = %q, want 4A", problem.ProblemID)
	}
	if !strings.Contains(problem.Title, "Watermelon") {
		t.Errorf("Title = %q, want it to name the problem", problem.Title)
	}
	if problem.TimeLimit == "" || problem.MemoryLimit == "" {
		t.Errorf("limits = %q / %q, want both parsed", problem.TimeLimit, problem.MemoryLimit)
	}
	if len(problem.TestCases) == 0 {
		t.Error("no sample tests parsed")
	}
	t.Logf("4A: %q, %s / %s, %d samples, tags=%s",
		problem.Title, problem.TimeLimit, problem.MemoryLimit, len(problem.TestCases), problem.Tags)
}

// TestLiveMainHostLogin is the verification the browser-solver work was missing: a
// real login against codeforces.com itself, not the mirrors. Everything before this
// only proved anonymous pages load.
//
// It logs in, then reads the submit form and round-trips the session through
// Export/Import — the three things every write action depends on. It deliberately does
// NOT submit: a submission is a permanent, public record on someone's profile.
//
// The password is never logged, only which markers each page carried.
//
// Run with: CF_LIVE=1 CF_HANDLE=... CF_PASSWORD=... go test -run TestLiveMainHostLogin -v
func TestLiveMainHostLogin(t *testing.T) {
	handle, password := os.Getenv("CF_HANDLE"), os.Getenv("CF_PASSWORD")
	if os.Getenv("CF_LIVE") == "" || handle == "" || password == "" {
		t.Skip("set CF_LIVE=1, CF_HANDLE and CF_PASSWORD to exercise a real login")
	}
	t.Cleanup(DisableBrowserSolver)
	path, err := EnableBrowserSolver(cloudflare.BrowserOptions{})
	if err != nil {
		t.Skipf("no browser to test with: %v", err)
	}
	t.Logf("browser: %s", path)

	s, err := NewWebSession()
	if err != nil {
		t.Fatal(err)
	}

	who, err := s.Login(handle, password)
	if err != nil {
		t.Fatalf("Login: %v", err)
	}
	t.Logf("logged in as %q via %s", who, s.Host())
	// The whole point of the solver: the session must be on the main host, because the
	// mirrors do not serve the archive, the problemset, or past contests.
	if !strings.HasPrefix(s.Host(), "https://codeforces.com") {
		t.Errorf("session landed on %s, wanted the main host", s.Host())
	}

	// LanguageOptions is the submit form, and it only renders for a signed-in user —
	// so this proves both that the form is reachable and that the session is real.
	langs, err := s.LanguageOptions(4)
	if err != nil {
		t.Fatalf("LanguageOptions(4): %v", err)
	}
	t.Logf("submit form reachable: %d languages", len(langs))
	for _, want := range []string{"G++", "Python"} {
		found := false
		for _, l := range langs {
			if strings.Contains(l.Name, want) {
				t.Logf("  %-4s %s", l.ID, l.Name)
				found = true
				break
			}
		}
		if !found {
			t.Errorf("no %s option in the dropdown", want)
		}
	}

	// Export/Import is how the session survives between requests, and it is the exact
	// shape the extension's cookies are stored in.
	blob, err := s.Export()
	if err != nil {
		t.Fatalf("Export: %v", err)
	}
	restored, err := NewWebSession()
	if err != nil {
		t.Fatal(err)
	}
	if err := restored.Import(blob); err != nil {
		t.Fatalf("Import: %v", err)
	}
	back, err := restored.LoggedInHandle()
	if err != nil {
		t.Fatalf("LoggedInHandle on the restored session: %v", err)
	}
	if back != who {
		t.Errorf("restored session belongs to %q, want %q", back, who)
	} else {
		t.Logf("session survives Export→Import as %q (%d bytes)", back, len(blob))
	}
}
