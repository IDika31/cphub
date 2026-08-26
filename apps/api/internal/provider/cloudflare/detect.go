// Package cloudflare is a Go counterpart to Python's cloudscraper: an http.Client
// that recognises what Cloudflare put in front of a site and, where the check is
// answerable without a browser, answers it and retries transparently.
//
// What it does, and what it honestly cannot do:
//
//   - Browser TLS fingerprint. Go's stdlib ClientHello is a known bot signature.
//     The transport here replays Chrome's or Firefox's hello via utls, and speaks
//     whichever protocol ALPN settles on.
//   - Browser header set, matched to the chosen hello.
//   - Legacy IUAM ("I'm Under Attack Mode"): the arithmetic puzzle answered at
//     /cdn-cgi/l/chk_jschl. Solved with a real JS engine, as cloudscraper does.
//   - Today's managed challenge, Turnstile and captcha gates: NOT solvable here.
//     They run obfuscated JavaScript that fingerprints the browser itself. The
//     Client reports them as a *ChallengeError, and a Solver can be plugged in
//     (a headless browser, or a paid captcha service) to supply cf_clearance.
//
// Measured on codeforces.com in August 2026: it serves cf_chl_opt with
// cType:'managed', and a byte-exact Chrome hello still gets 403. Fingerprints are
// necessary but not sufficient — that is the honest ceiling of this approach.
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
	// Cloudflare has largely retired it, so treat a hit here as a pleasant
	// surprise rather than the expected path.
	IUAM
	// Managed is today's default gate: cf_chl_opt with cType 'managed',
	// 'non-interactive' or 'interactive', backed by /cdn-cgi/challenge-platform.
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
	NoChallenge: "none", IUAM: "iuam", Managed: "managed-challenge",
	Turnstile: "turnstile", Captcha: "captcha", Blocked: "blocked", RateLimited: "rate-limited",
}

func (c Challenge) String() string {
	if n, ok := challengeNames[c]; ok {
		return n
	}
	return "unknown"
}

// Solvable reports whether this package can clear the challenge on its own.
func (c Challenge) Solvable() bool { return c == IUAM }

// NeedsBrowser reports whether clearing it requires executing the page's
// JavaScript — a headless browser or a solver service, not a better socket.
func (c Challenge) NeedsBrowser() bool {
	return c == Managed || c == Turnstile || c == Captcha
}

var (
	// The legacy form posts to chk_jschl and carries jschl_vc; either marker alone
	// is enough, since Cloudflare has shipped both shapes over the years.
	iuamRe      = regexp.MustCompile(`(?i)name="jschl_vc"|/cdn-cgi/l/chk_jschl`)
	managedRe   = regexp.MustCompile(`cf_chl_opt|/cdn-cgi/challenge-platform/|__cf_chl_f_tk`)
	turnstileRe = regexp.MustCompile(`challenges\.cloudflare\.com/turnstile|cf-turnstile-response`)
	captchaRe   = regexp.MustCompile(`(?i)hcaptcha\.com/|recaptcha/api\.js|g-recaptcha-response`)
	blockedRe   = regexp.MustCompile(`(?i)error 10\d\d|>Sorry, you have been blocked|cf-error-details`)
	// The interstitial's own wording, kept because a mirror can serve the page
	// with none of the script markers above.
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

// RayID is the cf-ray of a response, which is what Cloudflare support and the
// dashboard's firewall log index on. Worth carrying into error messages.
func RayID(h http.Header) string {
	if h == nil {
		return ""
	}
	return h.Get("cf-ray")
}

// Classify names the gate in front of a response. Order matters: a block page and
// a Turnstile page both carry the generic challenge-platform markers, so the more
// specific verdicts are tested first.
func Classify(status int, h http.Header, body string) Challenge {
	mitigated := h != nil && h.Get("cf-mitigated") != ""
	if !IsCloudflare(h) && !managedRe.MatchString(body) && !iuamRe.MatchString(body) {
		return NoChallenge
	}
	switch {
	case blockedRe.MatchString(body):
		return Blocked
	case iuamRe.MatchString(body):
		return IUAM
	case turnstileRe.MatchString(body):
		return Turnstile
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
