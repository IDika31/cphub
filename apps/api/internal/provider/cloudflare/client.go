package cloudflare

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/cookiejar"
	"net/url"
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
}

func (e *ChallengeError) Error() string {
	msg := fmt.Sprintf("%s: cloudflare %s (HTTP %d)", e.URL, e.Kind, e.Status)
	if e.RayID != "" {
		msg += ", ray " + e.RayID
	}
	if e.Kind.NeedsBrowser() {
		msg += " — needs JavaScript execution, plug in a Solver"
	}
	return msg
}

func (e *ChallengeError) Is(target error) bool {
	return target == ErrNeedsBrowser && e.Kind.NeedsBrowser()
}

// Solver clears what this package cannot: it is handed the challenge page and
// returns the cookies that get past it, cf_clearance above all. A headless
// browser or a captcha service goes here. Note that Cloudflare binds cf_clearance
// to the IP and User-Agent that earned it, so a solver has to run from the same
// egress as the client it is feeding.
type Solver interface {
	Solve(ctx context.Context, target *url.URL, kind Challenge, body string) ([]*http.Cookie, error)
}

type Options struct {
	// Browser fingerprint to imitate. Zero value means Chrome.
	Browser Browser
	// Jar keeps cf_clearance and the site's own cookies. Zero value means a fresh
	// in-memory jar; pass your own to persist clearance across process restarts.
	Jar http.CookieJar
	// Timeout is the per-request ceiling. Zero means 45s.
	Timeout time.Duration
	// MaxAttempts bounds how many times one request may be re-sent after solving
	// something. Zero means 3.
	MaxAttempts int
	// Solver, when set, is consulted for managed/Turnstile/captcha gates.
	Solver Solver
	// Clearance is a cf_clearance value earned elsewhere — typically copied out of
	// a real browser on the same network. ClearanceUA must be the User-Agent that
	// browser sent, or Cloudflare rejects the cookie.
	Clearance   string
	ClearanceUA string
	// IUAMDelay overrides the wait before answering a legacy challenge. Cloudflare
	// times the answer and rejects one that arrives too early; zero means 4s, the
	// value the page's own setTimeout uses.
	IUAMDelay time.Duration
}

// Client is an http.Client that answers what it can and reports what it cannot.
type Client struct {
	http      *http.Client
	tr        *transport
	opts      Options
	seeded    map[string]bool
	browser   Browser
	iuamDelay time.Duration
}

func New(o Options) (*Client, error) {
	browser := o.Browser
	if browser.Name == "" {
		browser = Chrome
	}
	if o.ClearanceUA != "" {
		// Copy so the package-level Chrome/Firefox values stay untouched.
		headers := make(map[string]string, len(browser.Headers))
		for k, v := range browser.Headers {
			headers[k] = v
		}
		headers["User-Agent"] = o.ClearanceUA
		browser.Headers = headers
	}
	jar := o.Jar
	if jar == nil {
		j, err := cookiejar.New(nil)
		if err != nil {
			return nil, err
		}
		jar = j
	}
	timeout := o.Timeout
	if timeout == 0 {
		timeout = 45 * time.Second
	}
	if o.MaxAttempts == 0 {
		o.MaxAttempts = 3
	}
	delay := o.IUAMDelay
	if delay == 0 {
		delay = 4 * time.Second
	}
	tr := newTransport(browser, timeout)
	return &Client{
		http:      &http.Client{Transport: tr, Jar: jar, Timeout: timeout},
		tr:        tr,
		opts:      o,
		seeded:    map[string]bool{},
		browser:   browser,
		iuamDelay: delay,
	}, nil
}

// Jar exposes the cookie jar, so a caller can persist cf_clearance itself.
func (c *Client) Jar() http.CookieJar { return c.http.Jar }

// Browser reports the fingerprint in use — useful when handing cf_clearance to
// another client, which must send the same User-Agent.
func (c *Client) Browser() Browser { return c.browser }
