package cloudflare

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"testing"
	"time"

	ws "github.com/fasthttp/websocket"
)

// TestLiveCodeforcesLoginGate answers what the headless solver cannot: is
// codeforces.com/enter passable by a browser at all, and does logging in there yield
// the cookies the server needs?
//
// Measured 2026-08-27, same IP and same browser build, minutes apart:
//   - /problemset/problem/4/A  cleared in 3s headless
//   - /enter                   still a managed challenge after 45s headless, no cookie
//
// So Cloudflare gates the login endpoint harder than the rest of the site, which is why
// login belongs in the user's own browser (the extension flow) rather than in a
// server-side solver. This test keeps that conclusion checkable instead of remembered.
//
// Headful by default, because "can a real browser do it" is the whole question. Set
// CF_GATE_HEADLESS=1 to re-measure the headless side.
//
// The password is never logged, and reaches the page as a JSON-encoded string literal
// rather than being spliced into JavaScript.
//
// Run: CF_LIVE=1 CF_HANDLE=... CF_PASSWORD=... go test -run TestLiveCodeforcesLoginGate -v
func TestLiveCodeforcesLoginGate(t *testing.T) {
	handle, password := os.Getenv("CF_HANDLE"), os.Getenv("CF_PASSWORD")
	if os.Getenv("CF_LIVE") == "" || handle == "" || password == "" {
		t.Skip("set CF_LIVE=1, CF_HANDLE and CF_PASSWORD to exercise a real login")
	}
	path, err := FindBrowser()
	if err != nil {
		t.Skipf("no browser to test with: %v", err)
	}
	headless := os.Getenv("CF_GATE_HEADLESS") != ""
	solver, err := NewBrowserSolver(BrowserOptions{Path: path, Headful: !headless})
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("browser: %s (headless=%t)", path, headless)

	ctx, cancel := context.WithTimeout(context.Background(), 6*time.Minute)
	defer cancel()

	page, stop := openGateBrowser(ctx, t, solver)
	defer stop()

	if err := page.maskHeadless(ctx, solver); err != nil {
		t.Fatalf("maskHeadless: %v", err)
	}

	// --- phase 1: get past the gate -----------------------------------------
	// Clearing the challenge on /enter lands on / rather than back on /enter, so the
	// gate opening and the login form appearing are two separate events. Waiting for
	// the form alone would time out on a page that had already been cleared.
	if err := page.navigate(ctx, "https://codeforces.com/enter"); err != nil {
		t.Fatalf("navigate: %v", err)
	}
	st, err := awaitGate(ctx, page, 3*time.Minute)
	if err != nil {
		t.Fatalf("%v — headless=%t", err, headless)
	}
	t.Logf("gate cleared (title=%q form=%t signed-in=%t url=%s)", st.Title, st.Form, st.Logout, st.URL)

	// --- phase 2: reach the form ---------------------------------------------
	if !st.Form && !st.Logout {
		t.Log("cleared onto another page — asking for /enter again, now holding clearance")
		if err := page.navigate(ctx, "https://codeforces.com/enter"); err != nil {
			t.Fatalf("re-navigate: %v", err)
		}
		st, err = awaitGate(ctx, page, 90*time.Second)
		if err != nil {
			t.Fatalf("second /enter: %v", err)
		}
		t.Logf("after re-navigation: title=%q form=%t signed-in=%t", st.Title, st.Form, st.Logout)
	}
	// The title lands with <head>; the form is far down <body>. awaitGate returning on
	// the title alone therefore reports "no form" on a login page that is merely still
	// rendering, so the form gets its own wait.
	if !st.Logout && !st.Form {
		st, err = awaitForm(ctx, page, 30*time.Second)
		if err != nil {
			names, _ := page.eval(ctx, `JSON.stringify(Array.from(document.querySelectorAll("input,select,textarea")).map(e => e.tagName.toLowerCase() + ":" + (e.name || e.id || "?")))`)
			t.Fatalf("%v; fields actually on the page: %s", err, names)
		}
		t.Logf("login form rendered (title=%q)", st.Title)
	}
	if st.Logout && !st.Form {
		t.Log("this profile is already signed in — nothing to type")
	}

	// --- phase 3: log in like a person --------------------------------------
	submittedAt := time.Now()
	if st.Form {
		if err := submitLoginForm(ctx, page, handle, password); err != nil {
			t.Fatal(err)
		}
		submittedAt = time.Now()
		t.Log("login form submitted")
	}

	// --- phase 4: did it take, and are the cookies there? -------------------
	deadline := time.Now().Add(2 * time.Minute)
	for time.Now().Before(deadline) {
		cookies, cErr := page.cookies(ctx, "https://codeforces.com/")
		now, sErr := readGateState(ctx, page)
		if cErr == nil && sErr == nil {
			if now.Logout {
				names := make([]string, 0, len(cookies))
				for _, ck := range cookies {
					names = append(names, ck.Name)
				}
				t.Logf("LOGGED IN as %q — cookies=[%s]", now.Handle, strings.Join(names, " "))
				// A signed-in page with no readable handle would link the wrong account, or
				// none: the handle is what the server stores and what every later call
				// uses, so it is not optional.
				if now.Handle == "" {
					t.Error("logged in but no handle readable — the anchored-on-logout rule found nothing")
				}
				// Hand the session on, in exactly the shape cf-session.ts posts it to
				// /api/sync/cf-session. Writing a file is what lets the two halves of the
				// contract be exercised together: the DevTools plumbing that can pass the
				// login gate is unexported in this package, while Submit lives in the
				// codeforces package, and codeforces already imports this one — so a
				// shared helper would be a circular import and an exported one would be
				// production code existing only for a test.
				if out := os.Getenv("CF_SESSION_OUT"); out != "" {
					if err := writeSessionFixture(out, now.Handle, cookies); err != nil {
						t.Errorf("writing session fixture: %v", err)
					} else {
						t.Logf("session written to %s — DELETE IT WHEN DONE, it grants full account access", out)
					}
				}
				return
			}
			// The form coming back after a real attempt is Codeforces saying no.
			if now.Form && time.Since(submittedAt) > 25*time.Second {
				t.Fatalf("login form still showing %s after submitting — Codeforces rejected the credentials",
					time.Since(submittedAt).Round(time.Second))
			}
		}
		time.Sleep(2 * time.Second)
	}
	t.Fatal("login submitted but never reached a signed-in page")
}

// gateState is what one look at the page can tell us.
//
// The page is queried rather than pattern-matched because document() truncates at 8 KB
// and Codeforces' login form sits far past that — a substring search over the slice
// reports "no form" on a page that plainly has one, which cost one wrong conclusion
// already.
type gateState struct {
	Form   bool   `json:"form"`
	Logout bool   `json:"logout"`
	Handle string `json:"handle"`
	Title  string `json:"title"`
	URL    string `json:"url"`
}

const gateProbe = `JSON.stringify((() => {
  const logout = document.querySelector('a[href*="/logout"], a.logout');
  // Anchor on the logout link and take the nearest /profile/ link, which is exactly
  // what probeLoginState in apps/extension/src/shared/cf-session.ts and
  // loggedInHandle in the codeforces package do.
  //
  // The rule this replaced read .enter-or-register-box, which does not exist on a
  // logged-in page at all — it is the logged-OUT header — so it reported an empty
  // handle for a session that was plainly signed in. Measured here 2026-08-27.
  let handle = "";
  for (let node = logout && logout.parentElement, i = 0; node && i < 5 && !handle; i++, node = node.parentElement) {
    const p = node.querySelector('a[href^="/profile/"]');
    if (p) handle = decodeURIComponent((p.getAttribute("href") || "").split("/")[2] || "");
  }
  return {
    form: !!document.querySelector('input[name="handleOrEmail"]'),
    logout: !!logout,
    handle: handle,
    title: document.title,
    url: location.pathname,
  };
})())`

func readGateState(ctx context.Context, page *cdpConn) (gateState, error) {
	var st gateState
	raw, err := page.eval(ctx, gateProbe)
	if err != nil {
		return st, err
	}
	return st, json.Unmarshal([]byte(raw), &st)
}

// awaitGate waits until the page is no longer a Cloudflare challenge, whatever it
// turned into.
func awaitGate(ctx context.Context, page *cdpConn, within time.Duration) (gateState, error) {
	deadline := time.Now().Add(within)
	var last gateState
	for time.Now().Before(deadline) {
		if st, sErr := readGateState(ctx, page); sErr == nil {
			last = st
			// A challenge page titles itself "Just a moment..."; anything else means
			// the gate is behind us, whichever page we ended up on.
			if st.Form || st.Logout || (st.Title != "" && !strings.Contains(st.Title, "Just a moment")) {
				return st, nil
			}
		}
		if _, html, dErr := page.document(ctx); dErr == nil && Classify(200, nil, html) == Blocked {
			return last, gateError("firewall block — nothing to log in to")
		}
		time.Sleep(2 * time.Second)
	}
	return last, gateError("never got past the gate in " + within.String() +
		" (title=" + last.Title + ", url=" + last.URL + ")")
}

// awaitForm waits for the login form itself, which appears later than the title.
func awaitForm(ctx context.Context, page *cdpConn, within time.Duration) (gateState, error) {
	deadline := time.Now().Add(within)
	var last gateState
	for time.Now().Before(deadline) {
		if st, sErr := readGateState(ctx, page); sErr == nil {
			last = st
			if st.Form || st.Logout {
				return st, nil
			}
		}
		time.Sleep(1 * time.Second)
	}
	return last, gateError("login form never rendered in " + within.String() +
		" (title=" + last.Title + ", url=" + last.URL + ")")
}

type gateError string

func (e gateError) Error() string { return string(e) }

func submitLoginForm(ctx context.Context, page *cdpConn, handle, password string) error {
	// json.Marshal produces a safe JS string literal, so a password containing quotes,
	// backslashes or $ cannot break out of the expression or corrupt it.
	h, _ := json.Marshal(handle)
	p, _ := json.Marshal(password)
	expr := `(() => {
	  const h = document.querySelector('input[name="handleOrEmail"]');
	  const p = document.querySelector('input[name="password"]');
	  const r = document.querySelector('input[name="remember"]');
	  if (!h || !p) return "no-form";
	  h.value = ` + string(h) + `;
	  p.value = ` + string(p) + `;
	  if (r) r.checked = true;
	  const form = h.closest("form");
	  if (!form) return "no-form-element";
	  // Click the real button when there is one: Codeforces' own handler fills ftaa
	  // and bfaa on submit, and form.submit() bypasses it.
	  const btn = form.querySelector('input[type="submit"], button[type="submit"]');
	  if (btn) btn.click(); else form.submit();
	  return "submitted";
	})()`
	outcome, err := page.eval(ctx, expr)
	if err != nil {
		return gateError("filling the login form: " + err.Error())
	}
	if outcome != "submitted" {
		return gateError("could not submit the login form: " + outcome)
	}
	return nil
}

// openGateBrowser launches a browser with the solver's own arguments — so the
// diagnostic cannot accidentally measure a different configuration — and attaches to a
// fresh tab.
func openGateBrowser(ctx context.Context, t *testing.T, solver *BrowserSolver) (*cdpConn, func()) {
	t.Helper()
	dir := t.TempDir()
	cmd := exec.Command(solver.path, solver.args(dir)...)
	if err := cmd.Start(); err != nil {
		t.Fatalf("launch %s: %v", solver.path, err)
	}
	kill := func() {
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
		}
	}

	port, err := waitDevToolsPort(ctx, dir, make(chan struct{}))
	if err != nil {
		kill()
		t.Fatalf("devtools port: %v", err)
	}
	wsURL, err := openTab(ctx, port)
	if err != nil {
		kill()
		t.Fatalf("open tab: %v", err)
	}
	conn, _, err := (&ws.Dialer{HandshakeTimeout: 20 * time.Second}).DialContext(ctx, wsURL, nil)
	if err != nil {
		kill()
		t.Fatalf("devtools socket: %v", err)
	}
	return &cdpConn{conn: conn}, func() { conn.Close(); kill() }
}

// writeSessionFixture serialises the captured session the way the extension posts it:
// identity cookies only. cf_clearance is dropped because Cloudflare binds it to the IP
// and User-Agent that earned it, so a copy is worthless anywhere else — the importing
// side has to earn its own.
func writeSessionFixture(path, handle string, cookies []*http.Cookie) error {
	type storedCookie struct {
		Name  string `json:"name"`
		Value string `json:"value"`
	}
	payload := struct {
		Handle  string         `json:"handle"`
		Cookies []storedCookie `json:"cookies"`
		Ftaa    string         `json:"ftaa"`
		Bfaa    string         `json:"bfaa"`
	}{Handle: handle}
	for _, ck := range cookies {
		if ck.Name == "cf_clearance" || ck.Value == "" {
			continue
		}
		payload.Cookies = append(payload.Cookies, storedCookie{Name: ck.Name, Value: ck.Value})
	}
	blob, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	return os.WriteFile(path, blob, 0o600)
}

func gateHasCookie(cookies []*http.Cookie, name string) bool {
	for _, ck := range cookies {
		if ck.Name == name && ck.Value != "" {
			return true
		}
	}
	return false
}
