// Package cloudflare is a Go counterpart to Python's cloudscraper: an http.Client
// that recognises what Cloudflare put in front of a site and, where the check is
// answerable without a browser, answers it and retries transparently.
//
// The parts that mirror cloudscraper:
//
//   - Fingerprint pairs (browsers.go): a browser hello replayed with utls plus the
//     header set that browser sends. cloudscraper fakes this with an OpenSSL cipher
//     string; utls replays the entire ClientHello, which is strictly closer.
//   - Challenge taxonomy (this file): v1 IUAM, v2/v3 JavaScript, managed, Turnstile,
//     captcha, firewall block, rate limit.
//   - The v1 IUAM solve (iuam.go), run in a real JS engine as cloudscraper does.
//   - Stealth mode (stealth.go), proxy rotation (proxy.go), session health and 403
//     recovery (session.go), captcha providers (captcha.go), Turnstile submission
//     (turnstile.go), token extraction (tokens.go).
//
// The honest ceiling: a managed challenge or a v3 VM challenge fingerprints the
// browser from inside its own JavaScript. cloudscraper "handles" v3 by running the
// page script against a stub window and, when that yields nothing, submitting a
// random string — which is not a solve. This package does the first half and then
// says so, because a fake answer that Cloudflare rejects is worse than an error
// that names the problem. Measured on codeforces.com in August 2026: cType
// 'managed', 403 for both Chrome and Firefox hellos (TestLiveCodeforces).
package cloudflare

import (
	"net/http"
	"regexp"
	"strings"
)

// Challenge is what Cloudflare answered with.
type Challenge int

const (
	// NoChallenge means the body is the site's own content.
	NoChallenge Challenge = iota
	// IUAM is the legacy puzzle: a small arithmetic program in the page, answered
	// by POSTing to /cdn-cgi/l/chk_jschl. The one cloudscraper made its name on;
	// Cloudflare has largely retired it.
	IUAM
	// JSChallengeV2 is the challenge-platform generation: /cdn-cgi/challenge-platform
	// with orchestrate/jsch/v1. Its script is obfuscated and browser-fingerprinting;
	// cloudscraper's free build refuses it outright.
	JSChallengeV2
	// JSChallengeV3 runs the same idea inside a JavaScript VM (orchestrate/jsch/v3,
	// window._cf_chl_ctx, __cf_chl_rt_tk form tokens).
	JSChallengeV3
	// Managed is today's default gate: cf_chl_opt with cType 'managed',
	// 'non-interactive' or 'interactive', orchestrated over captcha/managed/v1.
	Managed
	// Turnstile is Cloudflare's own widget, embedded in a page's form.
	Turnstile
	// Captcha is a third-party captcha gate (hCaptcha, reCAPTCHA).
	Captcha
	// Blocked is a firewall rule (error 1020 and friends): nothing to solve, the
	// request will not be allowed however it is dressed up.
	Blocked
	// RateLimited is Cloudflare's own 429, which wants waiting, not solving.
	RateLimited
)

var challengeNames = map[Challenge]string{
	NoChallenge: "none", IUAM: "iuam", JSChallengeV2: "js-challenge-v2",
	JSChallengeV3: "js-challenge-v3", Managed: "managed-challenge",
	Turnstile: "turnstile", Captcha: "captcha", Blocked: "blocked", RateLimited: "rate-limited",
}

func (c Challenge) String() string {
	if n, ok := challengeNames[c]; ok {
		return n
	}
	return "unknown"
}

// Solvable reports whether this package can clear the challenge on its own, with
// no browser and no third party.
func (c Challenge) Solvable() bool { return c == IUAM }

// NeedsBrowser reports whether clearing it requires executing the page's
// JavaScript — a headless browser or a solver service, not a better socket.
func (c Challenge) NeedsBrowser() bool {
	switch c {
	case Managed, Turnstile, Captcha, JSChallengeV2, JSChallengeV3:
		return true
	}
	return false
}

// The markers below are cloudscraper's, kept in its dispatch order.
var (
	iuamRe        = regexp.MustCompile(`(?i)name="jschl_vc"|/cdn-cgi/l/chk_jschl|/cdn-cgi/images/trace/jsch/`)
	orchestrateRe = regexp.MustCompile(`/cdn-cgi/challenge-platform/\S*orchestrate/(jsch|captcha|managed)/v(\d)`)
	v3Re          = regexp.MustCompile(`orchestrate/jsch/v3|window\._cf_chl_ctx\s*=|<form[^>]*id="challenge-form"[^>]*action="[^"]*__cf_chl_rt_tk=`)
	turnstileRe   = regexp.MustCompile(`challenges\.cloudflare\.com/turnstile|cf-turnstile-response|class="cf-turnstile"`)
	captchaRe     = regexp.MustCompile(`(?i)hcaptcha\.com/|recaptcha/api\.js|g-recaptcha-response|name="cf_captcha_kind"`)
	managedRe     = regexp.MustCompile(`cf_chl_opt|/cdn-cgi/challenge-platform/|__cf_chl_f_tk`)
	blockedRe     = regexp.MustCompile(`(?i)error 10\d\d|>Sorry, you have been blocked|cf-error-details|class="cf-error-code">10\d\d`)
	// The interstitial's own wording, kept because a cached or mirrored copy can
	// arrive with none of the script markers above.
	interstitialRe = regexp.MustCompile(`(?i)Just a moment\.\.\.|Enable JavaScript and cookies to continue|Checking your browser before accessing`)
)

// IsCloudflare reports whether a response came through Cloudflare at all. Absence
// is a strong signal: no cf-ray means the challenge machinery is not in play.
func IsCloudflare(h http.Header) bool {
	if h == nil {
		return false
	}
	return h.Get("cf-ray") != "" || h.Get("cf-mitigated") != "" ||
		strings.EqualFold(h.Get("server"), "cloudflare")
}

// RayID is the cf-ray of a response, which is what Cloudflare's own firewall log
// indexes on. Worth carrying into error messages.
func RayID(h http.Header) string {
	if h == nil {
		return ""
	}
	return h.Get("cf-ray")
}

// Classify names the gate in front of a response.
//
// Order matters and follows cloudscraper's: a block page, a Turnstile page and a
// v3 page all carry the generic challenge-platform markers, so the specific
// verdicts are tested before the generic ones.
func Classify(status int, h http.Header, body string) Challenge {
	mitigated := h != nil && h.Get("cf-mitigated") != ""
	if !IsCloudflare(h) && !managedRe.MatchString(body) && !iuamRe.MatchString(body) {
		return NoChallenge
	}
	orchestrated := orchestrateRe.FindStringSubmatch(body)
	switch {
	case blockedRe.MatchString(body):
		return Blocked
	case turnstileRe.MatchString(body):
		return Turnstile
	case v3Re.MatchString(body):
		return JSChallengeV3
	case orchestrated != nil && orchestrated[1] != "jsch":
		// captcha/managed orchestration is the managed challenge.
		return Managed
	case orchestrated != nil:
		return JSChallengeV2
	case iuamRe.MatchString(body):
		return IUAM
	case captchaRe.MatchString(body):
		return Captcha
	case managedRe.MatchString(body), interstitialRe.MatchString(body), mitigated:
		return Managed
	case status == http.StatusTooManyRequests:
		return RateLimited
	}
	return NoChallenge
}

// ClassifyResponse is Classify for a response whose body has already been read.
func ClassifyResponse(resp *http.Response, body string) Challenge {
	if resp == nil {
		return NoChallenge
	}
	return Classify(resp.StatusCode, resp.Header, body)
}
