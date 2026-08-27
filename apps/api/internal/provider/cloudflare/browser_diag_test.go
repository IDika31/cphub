package cloudflare

import (
	"context"
	"os"
	"os/exec"
	"strings"
	"testing"
	"time"

	ws "github.com/fasthttp/websocket"
)

// TestLiveBrowserDiagnostic watches one challenge attempt frame by frame and prints
// what the browser sees: the title, the gate classification, which cookies exist,
// and the automation signals a challenge script reads. When a solve fails, the
// question is always "detected, looping, or blocked?", and only the page can answer
// it — so this exists rather than being guessed at each time.
//
// Set CF_DIAG_URL to aim it somewhere else, CF_DIAG_HEADFUL=1 to watch it happen.
func TestLiveBrowserDiagnostic(t *testing.T) {
	if os.Getenv("CF_LIVE") == "" {
		t.Skip("set CF_LIVE=1 to probe the real Codeforces")
	}
	target := os.Getenv("CF_DIAG_URL")
	if target == "" {
		target = "https://codeforces.com/problemset/problem/4/A"
	}

	path, err := FindBrowser()
	if err != nil {
		t.Skipf("no browser to test with: %v", err)
	}
	solver, err := NewBrowserSolver(BrowserOptions{
		Path:    path,
		Headful: os.Getenv("CF_DIAG_HEADFUL") != "",
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("browser: %s (headful=%t)", path, solver.opts.Headful)

	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Second)
	defer cancel()

	dir := t.TempDir()
	cmd := launchForDiag(t, solver, dir)
	defer func() {
		if cmd != nil {
			_ = cmd.Process.Kill()
		}
	}()

	port, err := waitDevToolsPort(ctx, dir, make(chan struct{}))
	if err != nil {
		t.Fatalf("devtools port: %v", err)
	}
	wsURL, err := openTab(ctx, port)
	if err != nil {
		t.Fatalf("open tab: %v", err)
	}
	conn, _, err := (&ws.Dialer{HandshakeTimeout: 20 * time.Second}).DialContext(ctx, wsURL, nil)
	if err != nil {
		t.Fatalf("devtools socket: %v", err)
	}
	defer conn.Close()
	page := &cdpConn{conn: conn}

	ua, _ := page.userAgent(ctx)
	t.Logf("navigator.userAgent = %s", ua)
	if err := page.maskHeadless(ctx, solver); err != nil {
		t.Fatalf("maskHeadless: %v", err)
	}
	t.Logf("masked to           = %s", solver.UserAgent())
	// The signals a challenge script reads first. A "true" webdriver, or a UA or
	// brand list carrying "Headless", is a detection rather than a slow solve, and
	// no amount of waiting fixes it.
	for _, probe := range []string{
		"navigator.webdriver",
		"navigator.plugins.length",
		"navigator.languages.join(',')",
		"navigator.userAgent.includes('Headless')",
		"navigator.userAgentData && navigator.userAgentData.brands.map(b => b.brand + '/' + b.version).join(' ')",
	} {
		v, err := page.eval(ctx, "String("+probe+")")
		t.Logf("  %-46s = %s (err=%v)", probe, v, err)
	}

	if err := page.navigate(ctx, target); err != nil {
		t.Fatalf("navigate: %v", err)
	}

	deadline := time.Now().Add(75 * time.Second)
	for time.Now().Before(deadline) {
		state, html, err := page.document(ctx)
		if err != nil {
			t.Logf("t+%-4.0fs document error: %v", time.Since(deadline.Add(-75*time.Second)).Seconds(), err)
			time.Sleep(3 * time.Second)
			continue
		}
		title, _ := page.eval(ctx, "document.title")
		cookies, _ := page.cookies(ctx, target)
		names := make([]string, 0, len(cookies))
		for _, ck := range cookies {
			names = append(names, ck.Name)
		}
		t.Logf("t+%-4.0fs %-9s %-24q %-18s cookies=[%s]",
			75-time.Until(deadline).Seconds(), state, title,
			Classify(200, nil, html), strings.Join(names, " "))

		if hasClearance(cookies) {
			t.Logf("CLEARED after %.0fs", 75-time.Until(deadline).Seconds())
			return
		}
		time.Sleep(3 * time.Second)
	}

	// Never cleared: dump what the page was, because the wording is the finding.
	_, html, _ := page.document(ctx)
	t.Logf("--- page head ---\n%s", squeeze(html, 2500))
	t.Log("challenge never cleared — see the dump above for whether this is a loop, an interactive widget, or a block")
}

// launchForDiag starts the browser with the same arguments a real solve uses, so the
// diagnostic cannot accidentally measure a different configuration.
func launchForDiag(t *testing.T, solver *BrowserSolver, dir string) *exec.Cmd {
	t.Helper()
	cmd := exec.Command(solver.path, solver.args(dir)...)
	if err := cmd.Start(); err != nil {
		t.Fatalf("launch %s: %v", solver.path, err)
	}
	return cmd
}

func squeeze(s string, limit int) string {
	s = strings.Join(strings.Fields(s), " ")
	if len(s) > limit {
		s = s[:limit] + "…"
	}
	return s
}
