package cloudflare

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	ws "github.com/fasthttp/websocket"
)

// fakeDevTools speaks just enough CDP to exercise the request/reply plumbing, and
// deliberately speaks it badly: before every real answer it sends an unsolicited
// event and a reply to an id nobody is waiting for. Chrome does both — Network
// events arrive unprompted, and a reply can land after its caller gave up — so a
// client that trusts the next message to be its own answer breaks against the real
// browser and passes only against a polite stub.
func fakeDevTools(t *testing.T) *cdpConn {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := (&ws.Upgrader{}).Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()
		for {
			var req struct {
				ID     int    `json:"id"`
				Method string `json:"method"`
			}
			if err := conn.ReadJSON(&req); err != nil {
				return
			}
			_ = conn.WriteJSON(map[string]interface{}{
				"method": "Network.requestWillBeSent",
				"params": map[string]interface{}{"requestId": "1"},
			})
			_ = conn.WriteJSON(map[string]interface{}{
				"id":     req.ID - 1,
				"result": map[string]interface{}{"stale": true},
			})

			var reply map[string]interface{}
			switch req.Method {
			case "Runtime.evaluate":
				reply = map[string]interface{}{"id": req.ID, "result": map[string]interface{}{
					"result": map[string]interface{}{"value": "Mozilla/5.0 HeadlessProbe"},
				}}
			case "Network.getCookies":
				reply = map[string]interface{}{"id": req.ID, "result": map[string]interface{}{
					"cookies": []map[string]interface{}{{
						"name": "cf_clearance", "value": "earned", "domain": ".codeforces.com",
						"path": "/", "httpOnly": true, "secure": true, "expires": 1893456000.0,
					}, {
						"name": "JSESSIONID", "value": "site", "domain": "codeforces.com", "path": "/",
					}},
				}}
			default:
				reply = map[string]interface{}{"id": req.ID, "error": map[string]interface{}{
					"message": "'" + req.Method + "' wasn't found",
				}}
			}
			_ = conn.WriteJSON(reply)
		}
	}))
	t.Cleanup(srv.Close)

	conn, _, err := (&ws.Dialer{HandshakeTimeout: 5 * time.Second}).Dial("ws"+strings.TrimPrefix(srv.URL, "http"), nil)
	if err != nil {
		t.Fatalf("dial fake devtools: %v", err)
	}
	t.Cleanup(func() { conn.Close() })
	return &cdpConn{conn: conn}
}

func TestCDPCallIgnoresEventsAndStaleReplies(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	page := fakeDevTools(t)

	ua, err := page.userAgent(ctx)
	if err != nil {
		t.Fatalf("userAgent: %v", err)
	}
	if ua != "Mozilla/5.0 HeadlessProbe" {
		t.Errorf("userAgent = %q, want the browser's own value", ua)
	}

	// A second call proves the ids keep lining up: if the first call had consumed
	// the wrong message, this one would read the leftover and mismatch.
	cookies, err := page.cookies(ctx, "https://codeforces.com/")
	if err != nil {
		t.Fatalf("cookies: %v", err)
	}
	if len(cookies) != 2 {
		t.Fatalf("got %d cookies, want 2", len(cookies))
	}
	if !hasClearance(cookies) {
		t.Error("hasClearance = false, want true — cf_clearance was in the reply")
	}
	clearance := cookies[0]
	if clearance.Name != "cf_clearance" || clearance.Value != "earned" {
		t.Errorf("first cookie = %s=%s, want cf_clearance=earned", clearance.Name, clearance.Value)
	}
	// A leading dot is CDP's way of saying "and subdomains"; net/http spells the
	// same thing without it, and leaving it on makes the jar reject the cookie.
	if clearance.Domain != "codeforces.com" {
		t.Errorf("domain = %q, want the dot stripped", clearance.Domain)
	}
	if !clearance.HttpOnly {
		t.Error("HttpOnly lost — this is why document.cookie cannot be used to read it")
	}
	if clearance.Expires.IsZero() {
		t.Error("Expires lost, so the jar would treat a durable cookie as session-only")
	}
}

func TestCDPCallReportsProtocolErrors(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	page := fakeDevTools(t)

	err := page.call(ctx, "Nonsense.method", nil, nil)
	if err == nil {
		t.Fatal("err = nil, want the protocol error surfaced")
	}
	if !strings.Contains(err.Error(), "wasn't found") {
		t.Errorf("err = %v, want it to carry what DevTools said", err)
	}
}

func TestHasClearanceIgnoresEmptyValue(t *testing.T) {
	if hasClearance([]*http.Cookie{{Name: "cf_clearance", Value: ""}}) {
		t.Error("an empty cf_clearance is not a clearance")
	}
	if hasClearance([]*http.Cookie{{Name: "__cf_bm", Value: "x"}}) {
		t.Error("__cf_bm is not a clearance")
	}
}

func TestWaitDevToolsPortReadsTheFile(t *testing.T) {
	dir := t.TempDir()
	// Chromium writes the port on the first line and the browser socket path on the
	// second, so a parser that reads the whole file gets a number it cannot use.
	if err := os.WriteFile(filepath.Join(dir, "DevToolsActivePort"),
		[]byte("54321\n/devtools/browser/2f1a\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	port, err := waitDevToolsPort(ctx, dir, make(chan struct{}))
	if err != nil {
		t.Fatalf("waitDevToolsPort: %v", err)
	}
	if port != 54321 {
		t.Errorf("port = %d, want 54321", port)
	}
}

func TestWaitDevToolsPortGivesUpWhenBrowserDies(t *testing.T) {
	exited := make(chan struct{})
	close(exited)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Without watching the process this would sit out the whole timeout and then
	// blame the clock, hiding the real cause (a browser that refused to start).
	_, err := waitDevToolsPort(ctx, t.TempDir(), exited)
	if err == nil || !strings.Contains(err.Error(), "exited") {
		t.Fatalf("err = %v, want it to name the exit", err)
	}
}

func TestBrowserArgs(t *testing.T) {
	headless := (&BrowserSolver{}).args("/tmp/profile")
	if !contains(headless, "--headless=new") {
		t.Error("default args are missing --headless=new")
	}
	if contains(headless, "--no-sandbox") {
		t.Error("--no-sandbox must be opt-in: it drops the renderer sandbox")
	}
	if !contains(headless, "--disable-blink-features=AutomationControlled") {
		t.Error("navigator.webdriver is left exposed, which the challenge script reads first")
	}
	if !contains(headless, "--user-data-dir=/tmp/profile") {
		t.Error("profile dir not passed, so DevToolsActivePort lands somewhere unknown")
	}

	headful := (&BrowserSolver{opts: BrowserOptions{Headful: true, NoSandbox: true}}).args("/tmp/p")
	if contains(headful, "--headless=new") {
		t.Error("Headful still asked for headless")
	}
	if !contains(headful, "--no-sandbox") {
		t.Error("NoSandbox was not honoured")
	}
}

func contains(haystack []string, needle string) bool {
	for _, s := range haystack {
		if s == needle {
			return true
		}
	}
	return false
}
