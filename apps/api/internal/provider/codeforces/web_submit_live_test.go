package codeforces

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/IDika31/cphub/api/internal/provider/cloudflare"
)

// TestLiveSubmitWithBrowserSession is the last unverified link: a session captured in a
// real browser, restored on the server side, and used to actually submit.
//
// It needs a fixture written by TestLiveCodeforcesLoginGate, because the browser
// plumbing that can pass Codeforces' login gate is unexported in the cloudflare
// package and cannot be reached from here:
//
//	CF_LIVE=1 CF_HANDLE=… CF_PASSWORD=… CF_SESSION_OUT=/tmp/cf.json \
//	  go test ./internal/provider/cloudflare/ -run TestLiveCodeforcesLoginGate -v
//	CF_LIVE=1 CF_SESSION_IN=/tmp/cf.json CF_ALLOW_REAL_SUBMIT=1 \
//	  go test ./internal/provider/codeforces/ -run TestLiveSubmitWithBrowserSession -v
//
// CF_ALLOW_REAL_SUBMIT is a second, separate switch on purpose: this leaves a permanent
// public record on the account's profile, so CF_LIVE alone must never be enough to
// trigger it.
func TestLiveSubmitWithBrowserSession(t *testing.T) {
	fixture := os.Getenv("CF_SESSION_IN")
	if os.Getenv("CF_LIVE") == "" || fixture == "" {
		t.Skip("set CF_LIVE=1 and CF_SESSION_IN=<file from TestLiveCodeforcesLoginGate>")
	}
	if os.Getenv("CF_ALLOW_REAL_SUBMIT") == "" {
		t.Skip("set CF_ALLOW_REAL_SUBMIT=1 — this posts a real, permanent submission to the account's public profile")
	}

	blob, err := os.ReadFile(fixture)
	if err != nil {
		t.Fatalf("reading %s: %v", fixture, err)
	}
	// The fixture is the extension's wire format, so parsing it here also checks that
	// the two sides still agree on that shape.
	var wire struct {
		Handle  string `json:"handle"`
		Cookies []struct {
			Name  string `json:"name"`
			Value string `json:"value"`
		} `json:"cookies"`
	}
	if err := json.Unmarshal(blob, &wire); err != nil {
		t.Fatalf("fixture is not the extension's payload shape: %v", err)
	}
	if wire.Handle == "" || len(wire.Cookies) == 0 {
		t.Fatalf("fixture carries handle=%q and %d cookies — nothing to restore", wire.Handle, len(wire.Cookies))
	}
	for _, ck := range wire.Cookies {
		if ck.Name == "cf_clearance" {
			t.Fatal("fixture contains cf_clearance — the extension must never forward it, and the server must never store it")
		}
	}
	t.Logf("fixture: handle=%q, %d cookies", wire.Handle, len(wire.Cookies))

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
	if err := s.Import(blob); err != nil {
		t.Fatalf("Import: %v", err)
	}

	// Does the restored session read as logged in? This is the check cfSession runs
	// before every action, so a failure here means the whole fallback path is dead.
	who, err := s.LoggedInHandle()
	if err != nil {
		t.Fatalf("LoggedInHandle: %v", err)
	}
	if who != wire.Handle {
		t.Fatalf("restored session belongs to %q, want %q", who, wire.Handle)
	}
	t.Logf("session restored on the server side as %q via %s", who, s.Host())

	// The submit form only renders for a signed-in user, so this is the second proof.
	langs, err := s.LanguageOptions(4)
	if err != nil {
		t.Fatalf("LanguageOptions(4): %v", err)
	}
	langID, err := pickLanguageForTest(langs, "G++")
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("submit form reachable: %d languages, using %s", len(langs), langID)

	// 4A "Watermelon": w splits into two even positive parts iff w is even and w > 2.
	// The timestamp comment is not decoration — Codeforces rejects a resubmission of
	// byte-identical source ("You have submitted exactly the same code before"), which
	// would make a re-run of this test fail for a reason that is not the code's fault.
	source := fmt.Sprintf(`// CPHub submit-path verification %s
#include <iostream>
int main() {
    int w;
    if (!(std::cin >> w)) return 0;
    std::cout << ((w %% 2 == 0 && w > 2) ? "YES" : "NO") << std::endl;
    return 0;
}
`, time.Now().UTC().Format(time.RFC3339))

	if err := s.Submit(4, "A", langID, source); err != nil {
		t.Fatalf("Submit: %v", err)
	}
	t.Log("SUBMITTED — Codeforces accepted the form")

	// The verdict comes from the official API, which is not behind Cloudflare and needs
	// no session at all. That is the same split the extension path uses.
	api := NewAPI("", "")
	deadline := time.Now().Add(90 * time.Second)
	for time.Now().Before(deadline) {
		subs, sErr := api.UserStatus(who, 1, 3)
		if sErr != nil {
			t.Logf("verdict poll: %v", sErr)
			time.Sleep(3 * time.Second)
			continue
		}
		for _, sub := range subs {
			if sub.Problem.Ref() != "4A" {
				continue
			}
			t.Logf("submission %d: verdict=%q time=%dms memory=%dB",
				sub.ID, sub.Verdict, sub.TimeConsumedMillis, sub.MemoryConsumedBytes)
			if sub.Verdict != "" && sub.Verdict != "TESTING" {
				if sub.Verdict != "OK" {
					t.Errorf("verdict = %q, want OK — the submit worked but the code did not", sub.Verdict)
				}
				return
			}
			break
		}
		time.Sleep(3 * time.Second)
	}
	t.Error("submitted but no verdict inside 90s — check the profile by hand")
}

// pickLanguageForTest finds an option by substring. The handler has its own alias table
// (pickLanguage); this stays separate so a change there cannot quietly alter what this
// test submits.
func pickLanguageForTest(langs []Language, needle string) (string, error) {
	for _, l := range langs {
		if strings.Contains(l.Name, needle) {
			return l.ID, nil
		}
	}
	return "", fmt.Errorf("no language option contains %q", needle)
}
