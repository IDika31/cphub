package handler

import (
	"encoding/json"
	"errors"
	"io"
	"net/http/httptest"
	"testing"

	"github.com/IDika31/cphub/api/internal/provider/codeforces"
	"github.com/gofiber/fiber/v2"
)

// The cookie set a real Codeforces tab holds, as measured on codeforces.com: the
// session plus Codeforces' own marker, Cloudflare's clearance, and analytics noise.
var browserCookies = []ExtensionCookie{
	{Name: "JSESSIONID", Value: "8A1F"},
	{Name: "39ce7", Value: "cf-internal"},
	{Name: "X-User", Value: "remember-me"},
	{Name: "cf_clearance", Value: "earned-on-the-users-ip"},
	{Name: "_ga", Value: "GA1.2"},
	{Name: "", Value: "nameless"},
	{Name: "empty", Value: ""},
}

func TestCFAuthFromExtensionDropsClearance(t *testing.T) {
	auth := cfAuthFromExtension("IDika31", "abc123", "bfaa-const", browserCookies)

	for _, ck := range auth.Cookies {
		if ck.Name == "cf_clearance" {
			t.Fatal("cf_clearance was stored — Cloudflare binds it to the browser's IP, so it can never work from the server and a stored copy makes a dead session look live")
		}
		if ck.Name == "" || ck.Value == "" {
			t.Errorf("stored a useless cookie %q=%q", ck.Name, ck.Value)
		}
	}
	if auth.Handle != "IDika31" || auth.Ftaa != "abc123" || auth.Bfaa != "bfaa-const" {
		t.Errorf("identity lost: handle=%q ftaa=%q bfaa=%q", auth.Handle, auth.Ftaa, auth.Bfaa)
	}
	// The session cookie is the whole point of the exchange.
	if !hasCookie(auth.Cookies, "JSESSIONID", "8A1F") {
		t.Error("JSESSIONID missing — the stored session would not be logged in")
	}
	if !hasCookie(auth.Cookies, "X-User", "remember-me") {
		t.Error("X-User missing — Codeforces' remember-me is part of the session")
	}
}

// The blob this handler writes is restored by WebSession.Import, so the two have to
// agree on its shape. They are in different packages and nothing but this test holds
// them together.
func TestCFAuthFromExtensionRoundTripsThroughImport(t *testing.T) {
	auth := cfAuthFromExtension("IDika31", "abc123", "bfaa-const", browserCookies)
	blob, err := json.Marshal(auth)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	session, err := codeforces.NewWebSession()
	if err != nil {
		t.Fatalf("NewWebSession: %v", err)
	}
	if err := session.Import(blob); err != nil {
		t.Fatalf("Import rejected the blob this handler writes: %v", err)
	}

	// Export is the mirror of Import, so what survives a round trip is what the
	// restored session actually holds.
	out, err := session.Export()
	if err != nil {
		t.Fatalf("Export: %v", err)
	}
	var restored codeforces.WebAuth
	if err := json.Unmarshal(out, &restored); err != nil {
		t.Fatalf("unmarshal export: %v", err)
	}
	if restored.Handle != "IDika31" || restored.Ftaa != "abc123" {
		t.Errorf("restored handle=%q ftaa=%q, want IDika31/abc123", restored.Handle, restored.Ftaa)
	}
	if !hasCookie(restored.Cookies, "JSESSIONID", "8A1F") {
		t.Error("JSESSIONID did not survive Import→Export, so a browser session would not restore")
	}
}

func hasCookie(cookies []codeforces.StoredCookie, name, value string) bool {
	for _, ck := range cookies {
		if ck.Name == name && ck.Value == value {
			return true
		}
	}
	return false
}

// An expired session is the one Codeforces failure the user can fix immediately, so
// it has to be machine-readable: the web app reopens the extension login flow off the
// code, and would be stuck printing Indonesian prose without it.
func TestCFSessionErrorMarksExpiry(t *testing.T) {
	app := fiber.New()
	app.Get("/expired", func(c *fiber.Ctx) error {
		return cfSessionError(c, errCFSessionExpired)
	})
	app.Get("/wrapped", func(c *fiber.Ctx) error {
		// The auto-relogin path wraps it with the underlying cause; errors.Is has to
		// still see through that.
		return cfSessionError(c, errors.Join(errCFSessionExpired, errors.New("password lama")))
	})
	app.Get("/other", func(c *fiber.Ctx) error {
		return cfSessionError(c, errors.New("akun Codeforces belum dihubungkan"))
	})

	for _, tc := range []struct {
		path       string
		wantStatus int
		wantCode   string
	}{
		{"/expired", fiber.StatusUnauthorized, ErrCodeCFSessionExpired},
		{"/wrapped", fiber.StatusUnauthorized, ErrCodeCFSessionExpired},
		{"/other", fiber.StatusBadRequest, ""},
	} {
		resp, err := app.Test(httptest.NewRequest(fiber.MethodGet, tc.path, nil))
		if err != nil {
			t.Fatalf("%s: %v", tc.path, err)
		}
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		var out struct {
			Error string `json:"error"`
			Code  string `json:"code"`
		}
		if err := json.Unmarshal(body, &out); err != nil {
			t.Fatalf("%s: bad JSON %s", tc.path, body)
		}
		if resp.StatusCode != tc.wantStatus {
			t.Errorf("%s: status = %d, want %d", tc.path, resp.StatusCode, tc.wantStatus)
		}
		if out.Code != tc.wantCode {
			t.Errorf("%s: code = %q, want %q", tc.path, out.Code, tc.wantCode)
		}
		if out.Error == "" {
			t.Errorf("%s: no human-readable message", tc.path)
		}
	}
}

// The submit popup keys its label off the short verdict set, so a raw Codeforces
// verdict displayed as "Unknown" on a submission whose result was perfectly clear.
// Measured on 2257D: Codeforces said WRONG_ANSWER, the editor said Unknown.
func TestCFSubmitReplyNormalisesVerdicts(t *testing.T) {
	for _, tc := range []struct {
		raw         string
		wantVerdict string
		wantPending bool
	}{
		{"OK", VerdictAC, false},
		{"WRONG_ANSWER", VerdictWA, false},
		{"TIME_LIMIT_EXCEEDED", VerdictTLE, false},
		{"COMPILATION_ERROR", VerdictCE, false},
		{"RUNTIME_ERROR", VerdictRTE, false},
		{"TESTING", VerdictPend, true},
		{"", VerdictPend, true},
		// TLX already speaks the canonical set, so normalising must leave it alone.
		{"AC", VerdictAC, false},
		{"WA", VerdictWA, false},
	} {
		reply := cfSubmitReply(2257, tc.raw, 388523103, 46)
		if got := reply["verdict"]; got != tc.wantVerdict {
			t.Errorf("verdict for %q = %v, want %v", tc.raw, got, tc.wantVerdict)
		}
		if got := reply["pending"]; got != tc.wantPending {
			t.Errorf("pending for %q = %v, want %v", tc.raw, got, tc.wantPending)
		}
	}
}

// The submission URL has to point at the real submission, because it is the only way
// the user can see the failing test.
func TestCFSubmitReplyLinksTheSubmission(t *testing.T) {
	reply := cfSubmitReply(2257, "WRONG_ANSWER", 388523103, 46)
	want := "https://codeforces.com/contest/2257/submission/388523103"
	if got := reply["url"]; got != want {
		t.Errorf("url = %v, want %v", got, want)
	}
}
