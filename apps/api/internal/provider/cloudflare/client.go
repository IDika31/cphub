package cloudflare

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"sync"
	"time"
)

// ErrNeedsBrowser marks a challenge no HTTP client can clear. Test for it with
// errors.Is; the *ChallengeError carries which gate it was and the ray id.
var ErrNeedsBrowser = errors.New("cloudflare challenge requires a browser engine")

// ChallengeError is returned when a request ends on a gate instead of the page.
type ChallengeError struct {
	Kind   Challenge
	URL    string
	Status int
	RayID  string
	// Cause carries what went wrong while attempting the gate, when something did.
	Cause error
}

func (e *ChallengeError) Error() string {
	msg := fmt.Sprintf("%s: cloudflare %s (HTTP %d)", e.URL, e.Kind, e.Status)
	if e.RayID != "" {
		msg += ", ray " + e.RayID
	}
	if e.Cause != nil {
		return msg + ": " + e.Cause.Error()
	}
	if e.Kind.NeedsBrowser() {
		msg += " — needs JavaScript execution: configure Options.Captcha or Options.Solver"
	}
	return msg
}

func (e *ChallengeError) Unwrap() error { return e.Cause }

func (e *ChallengeError) Is(target error) bool {
	return target == ErrNeedsBrowser && e.Kind.NeedsBrowser()
}

// Solver clears what this package cannot: it is handed the challenge page and
// returns the cookies that get past it, cf_clearance above all. A headless browser
// or a scraping service goes here. Cloudflare binds cf_clearance to the IP and
// User-Agent that earned it, so a solver must run from the same egress as the
// client it feeds, with the same fingerprint (see Client.Browser).
type Solver interface {
	Solve(ctx context.Context, target *url.URL, kind Challenge, body string) ([]*http.Cookie, error)
}

// UserAgentReporter is the optional half of Solver: a solver that knows which
// User-Agent earned its cookies says so here, and the client adopts it before
// replaying the request. BrowserSolver implements it by reading navigator.userAgent
// off the browser it just drove, which beats assuming the two already agree.
type UserAgentReporter interface {
	UserAgent() string
}

// Client is an http.Client that answers what it can and reports what it cannot.
type Client struct {
	http    *http.Client
	tr      *transport
	opts    Options
	stealth *stealth
	proxies *ProxyManager
	captcha CaptchaProvider

	sem chan struct{}

	mu            sync.Mutex
	browser       Browser
	seeded        map[string]bool
	sessionStart  time.Time
	requests      int
	lastRequestAt time.Time
	last403At     time.Time
	retries403    int
}

func New(o Options) (*Client, error) {
	o.applyDefaults()

	browser := o.Browser
	if browser.Name == "" {
		browser = PickBrowser(o.Filter)
	}
	if o.ClearanceUA != "" {
		browser = withUserAgent(browser, o.ClearanceUA)
	}

	jar := o.Jar
	if jar == nil {
		j, err := cookiejar.New(nil)
		if err != nil {
			return nil, err
		}
		jar = j
	}

	captcha := o.CaptchaProvider
	if captcha == nil {
		built, err := NewCaptchaProvider(o.Captcha)
		if err != nil {
			return nil, err
		}
		captcha = built
	}

	proxies := NewProxyManager(o.Proxies, o.ProxyStrategy, o.ProxyBanTime)
	tr := newTransport(browser, o.Timeout, proxies)

	var sem chan struct{}
	if o.MaxConcurrent > 0 {
		sem = make(chan struct{}, o.MaxConcurrent)
	}

	return &Client{
		http:         &http.Client{Transport: tr, Jar: jar, Timeout: o.Timeout},
		tr:           tr,
		opts:         o,
		stealth:      newStealth(o.Stealth),
		proxies:      proxies,
		captcha:      captcha,
		sem:          sem,
		browser:      browser,
		seeded:       map[string]bool{},
		sessionStart: time.Now(),
	}, nil
}

// withUserAgent copies a fingerprint with a different User-Agent, leaving the
// package-level Chrome/Firefox values untouched.
func withUserAgent(b Browser, ua string) Browser {
	headers := make(map[string]string, len(b.Headers))
	for k, v := range b.Headers {
		headers[k] = v
	}
	headers["User-Agent"] = ua
	return Browser{Name: b.Name, Hello: b.Hello, Headers: headers}
}

// Jar exposes the cookie jar, so a caller can persist cf_clearance itself.
func (c *Client) Jar() http.CookieJar { return c.http.Jar }

// Browser reports the fingerprint in use. Anything handed cf_clearance from this
// client must send the same User-Agent.
func (c *Client) Browser() Browser {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.browser
}

// Proxies exposes the rotation pool for inspection.
func (c *Client) Proxies() *ProxyManager { return c.proxies }
