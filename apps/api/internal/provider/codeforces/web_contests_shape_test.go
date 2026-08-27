package codeforces

import (
	"os"
	"regexp"
	"strings"
	"testing"

	"github.com/IDika31/cphub/api/internal/provider/cloudflare"
)

// TestLiveContestsPageShape dumps how codeforces.com/contests marks registration state,
// so the extension's parser can be written against the real markup instead of a guess.
//
// It needs a logged-in session, because the three states only differ for a signed-in
// user: anonymously every open contest just shows a registration link. Reuse the fixture
// TestLiveCodeforcesLoginGate writes:
//
//	CF_LIVE=1 CF_HANDLE=… CF_PASSWORD=… CF_SESSION_OUT=/tmp/cf.json \
//	  go test ./internal/provider/cloudflare/ -run TestLiveCodeforcesLoginGate -v
//	CF_LIVE=1 CF_SESSION_IN=/tmp/cf.json \
//	  go test ./internal/provider/codeforces/ -run TestLiveContestsPageShape -v
//
// Read-only: it fetches one page and prints what it found. Nothing is registered.
func TestLiveContestsPageShape(t *testing.T) {
	fixture := os.Getenv("CF_SESSION_IN")
	if os.Getenv("CF_LIVE") == "" || fixture == "" {
		t.Skip("set CF_LIVE=1 and CF_SESSION_IN=<file from TestLiveCodeforcesLoginGate>")
	}
	blob, err := os.ReadFile(fixture)
	if err != nil {
		t.Fatalf("reading %s: %v", fixture, err)
	}
	t.Cleanup(DisableBrowserSolver)
	if _, err := EnableBrowserSolver(cloudflare.BrowserOptions{}); err != nil {
		t.Skipf("no browser to test with: %v", err)
	}
	s, err := NewWebSession()
	if err != nil {
		t.Fatal(err)
	}
	if err := s.Import(blob); err != nil {
		t.Fatalf("Import: %v", err)
	}

	body, status, _, err := s.getPage("/contests")
	if err != nil {
		t.Fatalf("GET /contests: %v", err)
	}
	who := loggedInHandle(body)
	t.Logf("HTTP %d, %d bytes, signed in as %q", status, len(body), who)
	if who == "" {
		t.Fatal("not signed in — the three registration states are indistinguishable anonymously")
	}

	// Deliberately NOT sliced at "Past contests": that phrase appears first in the
	// sidebar ("Past contests filter"), so cutting there threw away the contest tables
	// entirely and reported every marker as absent. Search the whole page instead.
	upcoming := body

	// Print the markup around every phrase the rendered page showed, so the parser can
	// key off whatever turns out to be stable.
	for _, needle := range []string{
		"Registration completed",
		"Before registration",
		"contestRegistration",
		"Before start",
		"countdown",
	} {
		hits := allIndexes(upcoming, needle)
		t.Logf("--- %q: %d occurrence(s) ---", needle, len(hits))
		for i, at := range hits {
			if i >= 3 {
				t.Logf("    (%d more)", len(hits)-3)
				break
			}
			t.Logf("    %s", squeezeAround(upcoming, at, 320))
		}
	}

	// One whole row, so the shape that ties a contest id to its state is visible.
	if rows := contestRowRe.FindAllString(upcoming, 4); rows != nil {
		for i, row := range rows {
			t.Logf("=== row %d (%d bytes) ===\n%s", i, len(row), squeeze(row, 1400))
		}
	} else {
		t.Log("no <tr data-contestid=…> rows matched — the row shape differs from the guess")
	}
}

// Codeforces tags each contest row with its own id, which is what makes a per-contest
// state readable without matching on names.
var contestRowRe = regexp.MustCompile(`(?is)<tr[^>]*data-contestid="\d+"[^>]*>.*?</tr>`)

func allIndexes(body, needle string) []int {
	var out []int
	for from := 0; ; {
		i := strings.Index(body[from:], needle)
		if i < 0 {
			return out
		}
		out = append(out, from+i)
		from += i + len(needle)
	}
}

func squeezeAround(body string, at, span int) string {
	start := at - span/3
	if start < 0 {
		start = 0
	}
	end := at + span
	if end > len(body) {
		end = len(body)
	}
	return squeeze(body[start:end], span)
}

func squeeze(s string, limit int) string {
	s = strings.Join(strings.Fields(s), " ")
	if len(s) > limit {
		s = s[:limit] + "…"
	}
	return s
}
