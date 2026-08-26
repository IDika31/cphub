package cloudflare

import (
	"net/http"
	"time"
)

// Options configures a Client. Every field has a working zero value: New(Options{})
// gives a Chrome-fingerprinted client with stealth delays, an in-memory cookie jar,
// hourly session refresh and 403 recovery — the same shape as
// cloudscraper.create_scraper() with no arguments.
//
// Flags read as negatives (Disabled, NoX) wherever cloudscraper's default is "on",
// so the zero value keeps that default instead of quietly turning a feature off.
type Options struct {
	// Browser is the fingerprint to imitate. Leave it zero to have one picked from
	// Filter, which is cloudscraper's browser={...} dict.
	Browser Browser
	Filter  BrowserFilter

	// Jar keeps cf_clearance and the site's own cookies. Zero means a fresh
	// in-memory jar; pass your own to persist clearance across restarts.
	Jar http.CookieJar
	// Timeout is the per-request ceiling. Zero means 45s.
	Timeout time.Duration
	// MaxAttempts bounds how many times one request may be re-sent after solving
	// something — cloudscraper's solveDepth. Zero means 3.
	MaxAttempts int

	// Solver clears what this package cannot: it is handed the challenge page and
	// returns the cookies that get past it. A headless browser goes here.
	Solver Solver
	// Captcha configures a third-party solving service for Turnstile and captcha
	// gates. Leave Provider empty to have those reported as errors instead.
	Captcha CaptchaOptions
	// CaptchaProvider supplies a provider directly, for a service this package does
	// not ship. It wins over Captcha when both are set.
	CaptchaProvider CaptchaProvider

	// Clearance is a cf_clearance value earned elsewhere. ClearanceUA must be the
	// User-Agent that earned it — Cloudflare binds the cookie to both the UA and
	// the IP, so a value from another machine will not work.
	Clearance   string
	ClearanceUA string

	// IUAMDelay overrides the wait before answering a legacy challenge. Cloudflare
	// rejects an answer that arrives too early; zero means 4s, and the page's own
	// setTimeout wins over both when it can be read.
	IUAMDelay time.Duration

	// Stealth shapes requests to look less like a script.
	Stealth StealthOptions

	// Proxies is the rotation pool: full URLs or bare host:port. Configuring any
	// proxy pins the client to HTTP/1.1 with keep-alive off, which is what makes
	// per-request rotation real rather than per-connection.
	Proxies       []string
	ProxyStrategy ProxyStrategy
	ProxyBanTime  time.Duration

	// SessionRefreshInterval is how old a session may get before it is thrown away
	// and re-established. Zero means one hour; negative disables refreshing.
	SessionRefreshInterval time.Duration
	// NoAutoRefreshOn403 turns off the retry-after-refresh that answers a 403 from
	// a session that used to work.
	NoAutoRefreshOn403 bool
	// Max403Retries bounds that recovery. Zero means 3.
	Max403Retries int
	// NoRotateFingerprint keeps the same hello and User-Agent across a refresh.
	// Refreshing without rotating usually earns the same 403 again.
	NoRotateFingerprint bool

	// MinRequestInterval is a hard floor between requests. Zero means none, unlike
	// cloudscraper's 1s: the stealth delay already spaces requests, and applying
	// both makes every request wait twice.
	MinRequestInterval time.Duration
	// MaxConcurrent caps requests in flight. Zero means unlimited.
	MaxConcurrent int

	// The disable switches mirror cloudscraper's disableCloudflareV1/V2/V3 and
	// disableTurnstile: the gate is still classified and reported, it just is not
	// attempted.
	DisableIUAM      bool
	DisableV2        bool
	DisableV3        bool
	DisableTurnstile bool
	DisableCaptcha   bool
}

func (o *Options) applyDefaults() {
	if o.Timeout == 0 {
		o.Timeout = 45 * time.Second
	}
	if o.MaxAttempts == 0 {
		o.MaxAttempts = 3
	}
	if o.IUAMDelay == 0 {
		o.IUAMDelay = 4 * time.Second
	}
	if o.SessionRefreshInterval == 0 {
		o.SessionRefreshInterval = time.Hour
	}
	if o.Max403Retries == 0 {
		o.Max403Retries = 3
	}
	if o.ProxyBanTime == 0 {
		o.ProxyBanTime = 5 * time.Minute
	}
}

// disabled reports whether a gate should be left alone.
func (o *Options) disabled(gate Challenge) bool {
	switch gate {
	case IUAM:
		return o.DisableIUAM
	case JSChallengeV2:
		return o.DisableV2
	case JSChallengeV3:
		return o.DisableV3
	case Turnstile:
		return o.DisableTurnstile
	case Captcha:
		return o.DisableCaptcha
	}
	return false
}
