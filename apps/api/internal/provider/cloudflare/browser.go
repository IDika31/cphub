package cloudflare

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	ws "github.com/fasthttp/websocket"
)

// BrowserSolver clears the gates this package documents as unsolvable without a
// browser — the managed challenge codeforces.com serves above all — by letting a
// real Chromium load the page and then taking the cookies it earned.
//
// It is a Solver, not a transport: the browser runs once per challenge, hands over
// cf_clearance, and exits. Every subsequent request goes back over the utls client,
// which is the only shape that fits the production box (892 MB of RAM — see
// deploy/push.sh): one Chromium per request would not fit, one per hour does.
//
// Cloudflare binds cf_clearance to the IP *and* the User-Agent that earned it, so
// two things have to line up. The IP lines up by construction, because the browser
// runs on the same host as the API. The User-Agent is read back off the running
// browser (UserAgent) rather than assumed, and Client.answer copies it onto the
// fingerprint before replaying the request — a guessed UA is exactly how a
// hard-won clearance cookie gets thrown away.
//
// No CDP library is used on purpose: the three commands this needs
// (Runtime.evaluate, Network.getCookies) are plain JSON over the DevTools socket,
// and github.com/fasthttp/websocket is already in the module graph via Fiber.
type BrowserSolver struct {
	path string
	opts BrowserOptions

	// Solves are serialised: two Chromium processes at once is what kills a small
	// box, and a challenge is rare enough that queueing costs nothing.
	//
	// ponytail: callers that queue here each still run their own solve when they
	// reach the front, so a burst of first-ever requests pays one launch apiece
	// sequentially. Bounded and short, but if that shows up as latency, have
	// cachingSolver return a clearance earned in the last few seconds instead.
	solving sync.Mutex

	mu sync.Mutex
	ua string
}

// BrowserOptions configures the solver. The zero value autodetects a browser and
// waits up to a minute for a challenge to clear.
type BrowserOptions struct {
	// Path is the Chromium/Chrome/Edge binary. Empty autodetects, honouring
	// CF_BROWSER_PATH first.
	Path string
	// Timeout bounds one solve, browser launch included. Zero means 60s.
	Timeout time.Duration
	// NoSandbox passes --no-sandbox. Chromium refuses to start as root without it,
	// which is the usual case in a container; it also drops the renderer sandbox,
	// so it is opt-in and defaults on only when the process really is root.
	NoSandbox bool
	// Headful runs a visible window, for working out why a challenge will not pass.
	Headful bool
	// ExtraArgs are appended to the command line verbatim.
	ExtraArgs []string
}

func (o *BrowserOptions) applyDefaults() {
	if o.Timeout == 0 {
		// A solve that works takes a few seconds; a cold Chromium on a small box
		// takes longer. 45s covers both and still leaves room under the 100s a
		// fronting proxy typically allows the origin.
		o.Timeout = 45 * time.Second
	}
	if !o.NoSandbox && os.Geteuid() == 0 {
		// Chromium exits immediately as root otherwise, and the error it prints
		// ("Running as root without --no-sandbox is not supported") would surface
		// here as an unexplained launch failure.
		o.NoSandbox = true
	}
}

// NewBrowserSolver locates a browser and returns a solver for it. The error is
// worth surfacing rather than swallowing: without a browser the managed challenge
// is simply unpassable, and a caller that knows that can say so instead of retrying
// into the same wall.
func NewBrowserSolver(o BrowserOptions) (*BrowserSolver, error) {
	o.applyDefaults()
	path := o.Path
	if path == "" {
		found, err := FindBrowser()
		if err != nil {
			return nil, err
		}
		path = found
	}
	return &BrowserSolver{path: path, opts: o}, nil
}

// Path is the browser binary in use, for a startup log line.
func (b *BrowserSolver) Path() string { return b.path }

// UserAgent is what the browser reported on the last solve, or "" before the first
// one. Anything replaying the cookies from a solve must send this.
func (b *BrowserSolver) UserAgent() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.ua
}

// Solve loads the challenged URL in a headless browser and returns the cookies it
// ends up holding. The gate kind and the challenge body are not needed: the browser
// runs whichever script the page carries.
func (b *BrowserSolver) Solve(ctx context.Context, target *url.URL, _ Challenge, _ string) ([]*http.Cookie, error) {
	if target == nil {
		return nil, errors.New("browser solver: no target url")
	}
	b.solving.Lock()
	defer b.solving.Unlock()

	ctx, cancel := context.WithTimeout(ctx, b.opts.Timeout)
	defer cancel()

	dir, err := os.MkdirTemp("", "cphub-cf-")
	if err != nil {
		return nil, fmt.Errorf("browser solver: profile dir: %w", err)
	}
	defer os.RemoveAll(dir)

	cmd := exec.Command(b.path, b.args(dir)...)
	// Chromium writes the port it chose into the profile dir, but it writes its
	// startup complaints to stderr, and a launch that fails is otherwise silent.
	var stderr strings.Builder
	cmd.Stderr = &stderr
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("browser solver: launching %s: %w", b.path, err)
	}
	exited := make(chan struct{})
	go func() { _ = cmd.Wait(); close(exited) }()
	defer func() {
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
		}
		<-exited
	}()

	port, err := waitDevToolsPort(ctx, dir, exited)
	if err != nil {
		return nil, fmt.Errorf("%w (browser said: %s)", err, firstLine(stderr.String()))
	}

	wsURL, err := openTab(ctx, port)
	if err != nil {
		return nil, err
	}
	conn, _, err := (&ws.Dialer{HandshakeTimeout: 20 * time.Second}).DialContext(ctx, wsURL, nil)
	if err != nil {
		return nil, fmt.Errorf("browser solver: devtools socket: %w", err)
	}
	defer conn.Close()
	page := &cdpConn{conn: conn}

	if err := page.maskHeadless(ctx, b); err != nil {
		return nil, err
	}
	if err := page.navigate(ctx, target.String()); err != nil {
		return nil, err
	}
	return b.await(ctx, page, target)
}

// maskHeadless removes the one signal that keeps a managed challenge from ever
// resolving: the User-Agent of a headless build says so out loud.
//
// Measured against codeforces.com (TestLiveBrowserDiagnostic): with
// navigator.webdriver false, five plugins and a normal language list, the page still
// looped on "Just a moment..." indefinitely while navigator.userAgent read
// "HeadlessChrome/151.0.0.0". Only that word had to go.
//
// The replacement is the browser's own string with "HeadlessChrome" swapped for
// "Chrome", not a UA borrowed from browsers.go: every other thing the page can
// measure — engine version, feature detection, the sec-ch-ua brand list — comes from
// this actual build, and a borrowed version number would contradict all of it.
//
// The masked value is what Cloudflare binds cf_clearance to, so it is also what
// UserAgent reports back for the utls client to replay.
func (c *cdpConn) maskHeadless(ctx context.Context, b *BrowserSolver) error {
	real, err := c.userAgent(ctx)
	if err != nil {
		return fmt.Errorf("browser solver: reading user agent: %w", err)
	}
	masked := strings.Replace(real, "HeadlessChrome", "Chrome", 1)

	if masked != real {
		// Only userAgent is overridden. acceptLanguage is deliberately left alone:
		// setting it also rewrites navigator.languages, and a q-value leaking into
		// that list ("en-US,en;q=0.9") is a tell no real browser shows. The launch
		// already passes --lang=en-US.
		if err := c.call(ctx, "Emulation.setUserAgentOverride", map[string]interface{}{
			"userAgent": masked,
		}, nil); err != nil {
			return fmt.Errorf("browser solver: masking user agent: %w", err)
		}
	}

	b.mu.Lock()
	b.ua = masked
	b.mu.Unlock()
	return nil
}

// await polls until the browser holds a clearance cookie, or until the page stops
// being a challenge at all, or until the challenge turns out to be a firewall block
// that no amount of waiting will lift.
func (b *BrowserSolver) await(ctx context.Context, page *cdpConn, target *url.URL) ([]*http.Cookie, error) {
	const (
		pollEvery = 750 * time.Millisecond
		// A challenge page is kilobytes of script. Anything shorter is a document
		// that has not been written yet — the tab is still on about:blank — and
		// classifying that emptiness as "no challenge" is how a solve returns an
		// empty jar in under a second while looking like a success.
		minDocument = 2000
	)
	var seen string
	for {
		cookies, err := page.cookies(ctx, target.String())
		if err != nil {
			return nil, err
		}
		if hasClearance(cookies) {
			return cookies, nil
		}

		state, html, dErr := page.document(ctx)
		if dErr == nil {
			// The response headers are long gone here, so classification rests on
			// the body's own markers — which is where every gate signature lives.
			kind := Classify(http.StatusOK, nil, html)
			seen = fmt.Sprintf("readyState=%s, %d bytes, looks like %s", state, len(html), kind)
			if state == "complete" && len(html) >= minDocument {
				switch kind {
				case Blocked:
					return nil, errors.New("browser solver: firewall rule (error 1020) — the request is refused, not challenged")
				case NoChallenge:
					// Cloudflare let this page through without issuing clearance.
					// The cookies it does hold are still the session, so hand them
					// over rather than waiting out the timeout for a cookie that is
					// never coming.
					return cookies, nil
				}
			}
		}

		select {
		case <-time.After(pollEvery):
		case <-ctx.Done():
			if seen == "" {
				seen = "the page never reported its state"
			}
			return nil, fmt.Errorf("browser solver: challenge still unsolved after %s (%s)", b.opts.Timeout, seen)
		}
	}
}

func hasClearance(cookies []*http.Cookie) bool {
	for _, ck := range cookies {
		if ck.Name == "cf_clearance" && ck.Value != "" {
			return true
		}
	}
	return false
}

// args is the command line. The flags are the minimum that makes a headless
// Chromium survive a small server and not announce itself:
// --disable-blink-features=AutomationControlled drops navigator.webdriver, which is
// the first thing a challenge script reads, and --disable-dev-shm-usage keeps the
// renderer off a /dev/shm too small to hold it.
func (b *BrowserSolver) args(profileDir string) []string {
	args := make([]string, 0, 12+len(b.opts.ExtraArgs))
	if !b.opts.Headful {
		// The old --headless is the one every bot-detection script knows; the "new"
		// mode is a full browser with no window, and differs from a headful one in
		// far fewer observable ways.
		args = append(args, "--headless=new")
	}
	args = append(args,
		"--remote-debugging-port=0",
		"--user-data-dir=" + profileDir,
		"--no-first-run",
		"--no-default-browser-check",
		"--disable-blink-features=AutomationControlled",
		"--disable-dev-shm-usage",
		"--disable-gpu",
		"--mute-audio",
		"--window-size=1280,800",
		"--lang=en-US",
	)
	if b.opts.NoSandbox {
		args = append(args, "--no-sandbox")
	}
	args = append(args, b.opts.ExtraArgs...)
	// about:blank keeps the launch cheap; the real navigation happens through
	// /json/new, which is also how the page's socket URL is discovered.
	return append(args, "about:blank")
}

// FindBrowser locates a Chromium-family binary. CF_BROWSER_PATH wins, then PATH,
// then the per-platform install locations. Edge is accepted last: it is Chromium
// underneath and speaks the same protocol, which on a stock Windows box is the
// difference between this working and not.
func FindBrowser() (string, error) {
	if p := os.Getenv("CF_BROWSER_PATH"); p != "" {
		if _, err := os.Stat(p); err != nil {
			return "", fmt.Errorf("CF_BROWSER_PATH=%q is not usable: %w", p, err)
		}
		return p, nil
	}
	for _, name := range []string{
		"google-chrome-stable", "google-chrome", "chromium", "chromium-browser",
		"chrome", "microsoft-edge", "msedge",
	} {
		if p, err := exec.LookPath(name); err == nil {
			return p, nil
		}
	}
	for _, p := range platformBrowserPaths() {
		if _, err := os.Stat(p); err == nil {
			return p, nil
		}
	}
	return "", errors.New("no Chromium-family browser found: install chromium (apt install chromium) or set CF_BROWSER_PATH")
}

func platformBrowserPaths() []string {
	switch runtime.GOOS {
	case "windows":
		var out []string
		for _, root := range []string{
			os.Getenv("ProgramFiles"), os.Getenv("ProgramFiles(x86)"), os.Getenv("LocalAppData"),
		} {
			if root == "" {
				continue
			}
			out = append(out,
				filepath.Join(root, `Google\Chrome\Application\chrome.exe`),
				filepath.Join(root, `Microsoft\Edge\Application\msedge.exe`),
				filepath.Join(root, `Chromium\Application\chrome.exe`),
			)
		}
		return out
	case "darwin":
		return []string{
			"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
			"/Applications/Chromium.app/Contents/MacOS/Chromium",
			"/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
		}
	default:
		return []string{
			"/usr/bin/google-chrome-stable", "/usr/bin/google-chrome",
			"/usr/bin/chromium", "/usr/bin/chromium-browser",
			"/snap/bin/chromium", "/usr/bin/microsoft-edge",
		}
	}
}

// waitDevToolsPort reads the port Chromium picked. --remote-debugging-port=0 means
// "choose a free one", which avoids colliding with anything else on the box; the
// number lands in DevToolsActivePort inside the profile directory.
func waitDevToolsPort(ctx context.Context, profileDir string, exited <-chan struct{}) (int, error) {
	file := filepath.Join(profileDir, "DevToolsActivePort")
	for {
		if raw, err := os.ReadFile(file); err == nil {
			first := strings.TrimSpace(strings.SplitN(strings.TrimSpace(string(raw)), "\n", 2)[0])
			if port, err := strconv.Atoi(first); err == nil && port > 0 {
				return port, nil
			}
		}
		select {
		case <-exited:
			return 0, errors.New("browser solver: browser exited before opening a debugging port")
		case <-time.After(100 * time.Millisecond):
		case <-ctx.Done():
			return 0, errors.New("browser solver: browser never opened a debugging port")
		}
	}
}

// openTab opens a blank tab and returns its socket URL. Talking to the page target
// directly keeps the protocol flat — no Target.attach, no sessionId on every
// message.
//
// The tab is deliberately opened blank rather than with ?url=: Edge accepts that
// parameter, answers 200, and then does not navigate, which looks from here like a
// challenge that never resolves on a page that is really still about:blank.
// Page.navigate is the instruction every Chromium build honours.
func openTab(ctx context.Context, port int) (string, error) {
	endpoint := fmt.Sprintf("http://127.0.0.1:%d/json/new", port)
	var lastErr error
	// Chromium 111 and later reject GET here to blunt DNS-rebinding attacks on the
	// DevTools port; older builds only allow GET. Try the modern verb first.
	for _, method := range []string{http.MethodPut, http.MethodGet} {
		req, err := http.NewRequestWithContext(ctx, method, endpoint, nil)
		if err != nil {
			return "", err
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			lastErr = err
			continue
		}
		raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
		resp.Body.Close()
		if err != nil {
			lastErr = err
			continue
		}
		if resp.StatusCode != http.StatusOK {
			lastErr = fmt.Errorf("devtools /json/new: HTTP %d: %s", resp.StatusCode, firstLine(string(raw)))
			continue
		}
		var tab struct {
			WebSocketDebuggerURL string `json:"webSocketDebuggerUrl"`
		}
		if err := json.Unmarshal(raw, &tab); err != nil {
			lastErr = err
			continue
		}
		if tab.WebSocketDebuggerURL == "" {
			lastErr = errors.New("devtools /json/new: no webSocketDebuggerUrl in reply")
			continue
		}
		return tab.WebSocketDebuggerURL, nil
	}
	return "", fmt.Errorf("browser solver: opening tab: %w", lastErr)
}

// cdpConn is one page's DevTools socket. Requests carry an id and replies echo it;
// anything without a matching id is an event this package did not ask for.
type cdpConn struct {
	conn *ws.Conn
	id   int
}

func (c *cdpConn) call(ctx context.Context, method string, params map[string]interface{}, out interface{}) error {
	c.id++
	id := c.id
	if err := c.conn.WriteJSON(map[string]interface{}{"id": id, "method": method, "params": params}); err != nil {
		return fmt.Errorf("cdp %s: %w", method, err)
	}
	deadline, ok := ctx.Deadline()
	if !ok {
		deadline = time.Now().Add(30 * time.Second)
	}
	if err := c.conn.SetReadDeadline(deadline); err != nil {
		return err
	}
	for {
		var msg struct {
			ID     int             `json:"id"`
			Result json.RawMessage `json:"result"`
			Error  *struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		if err := c.conn.ReadJSON(&msg); err != nil {
			return fmt.Errorf("cdp %s: %w", method, err)
		}
		if msg.ID != id {
			continue // an event, or a reply to a call that already timed out
		}
		if msg.Error != nil {
			return fmt.Errorf("cdp %s: %s", method, msg.Error.Message)
		}
		if out == nil {
			return nil
		}
		return json.Unmarshal(msg.Result, out)
	}
}

// navigate points the tab at a URL. Chromium reports a refused navigation in
// errorText rather than as a protocol error, so an unchecked call returns success
// while the tab sits on about:blank.
func (c *cdpConn) navigate(ctx context.Context, target string) error {
	var res struct {
		ErrorText string `json:"errorText"`
	}
	if err := c.call(ctx, "Page.navigate", map[string]interface{}{"url": target}, &res); err != nil {
		return fmt.Errorf("browser solver: navigating to %s: %w", target, err)
	}
	if res.ErrorText != "" {
		return fmt.Errorf("browser solver: navigating to %s: %s", target, res.ErrorText)
	}
	return nil
}

// eval runs an expression in the page and returns it as a string.
func (c *cdpConn) eval(ctx context.Context, expression string) (string, error) {
	var res struct {
		Result struct {
			Value string `json:"value"`
		} `json:"result"`
	}
	err := c.call(ctx, "Runtime.evaluate", map[string]interface{}{
		"expression":    expression,
		"returnByValue": true,
	}, &res)
	return res.Result.Value, err
}

func (c *cdpConn) userAgent(ctx context.Context) (string, error) {
	return c.eval(ctx, "navigator.userAgent")
}

// document returns the load state and the head of the markup, in one round trip.
// Only the top of the page matters — every gate marker sits in the head or the
// first script — so the slice keeps a full page off the socket on every poll. The
// readyState travels with it because the two are only meaningful together: markup
// read before the document is complete says nothing about which page won.
func (c *cdpConn) document(ctx context.Context) (state, html string, err error) {
	raw, err := c.eval(ctx, `JSON.stringify([document.readyState,`+
		` document.documentElement ? document.documentElement.outerHTML.slice(0, 8000) : ""])`)
	if err != nil {
		return "", "", err
	}
	var pair []string
	if err := json.Unmarshal([]byte(raw), &pair); err != nil || len(pair) != 2 {
		return "", "", fmt.Errorf("cdp document: unreadable reply (%d bytes)", len(raw))
	}
	return pair[0], pair[1], nil
}

// cookies reads the jar for one URL. cf_clearance is HttpOnly, so document.cookie
// cannot see it and this has to come from the protocol.
func (c *cdpConn) cookies(ctx context.Context, target string) ([]*http.Cookie, error) {
	var res struct {
		Cookies []struct {
			Name     string  `json:"name"`
			Value    string  `json:"value"`
			Domain   string  `json:"domain"`
			Path     string  `json:"path"`
			Expires  float64 `json:"expires"`
			HTTPOnly bool    `json:"httpOnly"`
			Secure   bool    `json:"secure"`
		} `json:"cookies"`
	}
	if err := c.call(ctx, "Network.getCookies", map[string]interface{}{"urls": []string{target}}, &res); err != nil {
		return nil, err
	}
	out := make([]*http.Cookie, 0, len(res.Cookies))
	for _, ck := range res.Cookies {
		converted := &http.Cookie{
			Name:     ck.Name,
			Value:    ck.Value,
			Domain:   strings.TrimPrefix(ck.Domain, "."),
			Path:     ck.Path,
			HttpOnly: ck.HTTPOnly,
			Secure:   ck.Secure,
		}
		if ck.Expires > 0 {
			converted.Expires = time.Unix(int64(ck.Expires), 0)
		}
		out = append(out, converted)
	}
	return out, nil
}

func firstLine(s string) string {
	s = strings.TrimSpace(s)
	if i := strings.IndexAny(s, "\r\n"); i >= 0 {
		s = s[:i]
	}
	if len(s) > 200 {
		s = s[:200]
	}
	if s == "" {
		return "nothing"
	}
	return s
}
