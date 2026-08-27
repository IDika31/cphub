package codeforces

import (
	"context"
	"net/http"
	"net/url"
	"sync"

	"github.com/IDika31/cphub/api/internal/provider/cloudflare"
)

// The browser solver is process-wide on purpose.
//
// A WebSession is built per request (see handler.cfSession), and each one needs its
// own cookie jar — sharing a jar would hand one user's Codeforces login to the next.
// But the Cloudflare clearance is not per user: it belongs to this machine's IP and
// the browser's User-Agent. So the solver, and the cf_clearance it earns, live here
// and are shared, while the jars stay separate.
//
// Without that split every submit, register and problem fetch would launch its own
// Chromium. The production box has 892 MB of RAM (deploy/push.sh), so it gets one
// launch when the clearance is missing or stale, and none at all in between.
var solverState struct {
	mu     sync.Mutex
	solver cloudflare.Solver
}

// clearanceCache is the cf_clearance the last solve produced, with the User-Agent
// that earned it. Cloudflare binds the cookie to both, so they are stored and
// handed out together or not at all.
var clearanceCache struct {
	mu    sync.Mutex
	value string
	ua    string
}

// EnableBrowserSolver points this package at a headless browser, which is what
// makes codeforces.com reachable without a logged-in browser of the user's own.
// It returns the browser binary in use, for a startup log line.
//
// An error means no usable browser was found. That is not fatal: sessions built
// afterwards can still reach codeforces.com whenever Cloudflare is not challenging,
// and the extension path does not depend on this at all.
func EnableBrowserSolver(opts cloudflare.BrowserOptions) (string, error) {
	browser, err := cloudflare.NewBrowserSolver(opts)
	if err != nil {
		return "", err
	}
	solverState.mu.Lock()
	solverState.solver = cachingSolver{inner: browser}
	solverState.mu.Unlock()
	return browser.Path(), nil
}

// DisableBrowserSolver turns the solver off again. Tests use it to keep a
// solver enabled in one case from leaking into the next.
func DisableBrowserSolver() {
	solverState.mu.Lock()
	solverState.solver = nil
	solverState.mu.Unlock()

	clearanceCache.mu.Lock()
	clearanceCache.value, clearanceCache.ua = "", ""
	clearanceCache.mu.Unlock()
}

func activeSolver() cloudflare.Solver {
	solverState.mu.Lock()
	defer solverState.mu.Unlock()
	return solverState.solver
}

func cachedClearance() (value, ua string) {
	clearanceCache.mu.Lock()
	defer clearanceCache.mu.Unlock()
	// Half a pair is useless: a clearance cookie replayed under the wrong
	// User-Agent is rejected, so an entry without both is treated as absent.
	if clearanceCache.value == "" || clearanceCache.ua == "" {
		return "", ""
	}
	return clearanceCache.value, clearanceCache.ua
}

// cachingSolver is the real solver plus a memory of what it produced, so the next
// WebSession can seed the cookie instead of launching a browser again.
type cachingSolver struct {
	inner interface {
		cloudflare.Solver
		cloudflare.UserAgentReporter
	}
}

func (c cachingSolver) UserAgent() string { return c.inner.UserAgent() }

func (c cachingSolver) Solve(ctx context.Context, target *url.URL, kind cloudflare.Challenge, body string) ([]*http.Cookie, error) {
	cookies, err := c.inner.Solve(ctx, target, kind, body)
	if err != nil {
		return nil, err
	}
	ua := c.inner.UserAgent()
	for _, ck := range cookies {
		if ck.Name != "cf_clearance" || ck.Value == "" || ua == "" {
			continue
		}
		clearanceCache.mu.Lock()
		clearanceCache.value, clearanceCache.ua = ck.Value, ua
		clearanceCache.mu.Unlock()
		break
	}
	return cookies, nil
}
