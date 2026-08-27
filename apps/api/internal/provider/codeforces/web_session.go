package codeforces

import (
	"crypto/sha1"
	"encoding/hex"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/IDika31/cphub/api/internal/provider/cloudflare"
)

// WebSession talks to the Codeforces web UI, which is the only place submitting a
// solution and registering for a contest exist — the official API is read-only and
// has been "write-methods coming soon" since 2013.
//
// codeforces.com answers 403 behind a Cloudflare managed challenge, which no HTTP
// client can clear on its own. A headless browser can, so when one is configured
// (EnableBrowserSolver, wired from main) every request here goes over
// internal/provider/cloudflare with that browser as its Solver: the browser earns
// cf_clearance once, and the fast utls client replays it for everything after. That
// is what makes the whole site — problemset, archive, submissions, submit, register
// — work at all.
//
// Without a browser the client still tries codeforces.com over the stdlib transport,
// which works only while Cloudflare is not challenging. There is no mirror fallback —
// see WebHosts for why.
type WebSession struct {
	http pageFetcher
	// jar is shared with whatever fetcher is in use, because both the
	// proof-of-work answer and Export/Import work on cookies directly.
	jar http.CookieJar
	// viaCloudflare records that http is the cloudflare client, which sends its own
	// coherent header set — adding a second User-Agent on top of it would
	// contradict the TLS fingerprint it dialled with.
	viaCloudflare bool
	hosts         []string
	host          string // the host that last answered
	// ftaa/bfaa are the fingerprint pair the login associated with this session;
	// handle is who it belongs to. See web_auth.go.
	ftaa   string
	bfaa   string
	handle string
}

// pageFetcher is the whole HTTP surface this file needs, which is what lets the
// stdlib client and the Cloudflare-aware one stand in for each other.
type pageFetcher interface {
	Do(req *http.Request) (*http.Response, error)
}

// WebHosts is codeforces.com and nothing else.
//
// The m1/m3 mirrors used to be listed here as a fallback and have been removed on
// purpose. They are not a smaller Codeforces, they are a different one: measured
// unauthenticated, /enter serves the real login page, every /contest/* path serves
// that same login page, and /problemset/*, /contests, /submissions/* and
// /contestRegistration/* answer 404. They carry the contest currently being run and
// nothing else.
//
// So a fallback to them did not degrade gracefully, it degraded dishonestly: a login
// would succeed against m1 and then every archive page, every practice problem and
// every submit outside a live round would fail with a 404 that looked like the
// problem did not exist. Reaching codeforces.com is now either possible or reported —
// there is no third state that half works.
var WebHosts = []string{"https://codeforces.com"}

func NewWebSession() (*WebSession, error) {
	jar, err := cookiejar.New(nil)
	if err != nil {
		return nil, err
	}
	s := &WebSession{jar: jar, hosts: WebHosts, host: WebHosts[0]}

	if solver := activeSolver(); solver != nil {
		clearance, ua := cachedClearance()
		client, cErr := cloudflare.New(cloudflare.Options{
			Jar:    jar,
			Solver: solver,
			// Reuse the clearance an earlier request already paid a browser launch
			// for. Without this every user action would start a Chromium, which the
			// production box does not have the memory for.
			Clearance:   clearance,
			ClearanceUA: ua,
			Timeout:     60 * time.Second,
			// Two attempts is exactly the normal flow: send, get the challenge,
			// solve, send again. A third buys nothing — a solve that failed will
			// fail again the same way — and this deployment sits behind Cloudflare,
			// which gives up on the origin at 100s, so an unbounded retry chain
			// turns a reportable error into an unexplained 524.
			MaxAttempts:   2,
			Max403Retries: 1,
			// These are user-initiated actions, not a crawl: a stealth nap between
			// every request would show up as latency on a submit for no gain, and a
			// randomised Accept would contradict the browser profile's own headers.
			Stealth: cloudflare.StealthOptions{NoHumanLikeDelays: true, NoRandomizeHeaders: true},
			// A refresh must not rotate the fingerprint: the User-Agent is half of
			// what cf_clearance is bound to, so rotating it throws the cookie away.
			NoRotateFingerprint: true,
		})
		if cErr == nil {
			s.http, s.viaCloudflare = client, true
			return s, nil
		}
		log.Printf("[cf-web] cloudflare client unavailable, using the plain transport: %v", cErr)
	}

	s.http = &http.Client{Jar: jar, Timeout: 45 * time.Second}
	return s, nil
}

// Host is the host that answered, for building absolute URLs in log lines and replies.
func (s *WebSession) Host() string { return s.host }

const browserCheckMarker = "browser is being checked"

var (
	csrfRe = regexp.MustCompile(`csrf='([0-9a-f]{16,})'`)
	// Codeforces reports a rejected form in an element whose class merely CONTAINS
	// "error", and it is a div rather than a span:
	//   <div class="subscription-row error ">Invalid handle/email or password</div>
	// The old span-only pattern matched none of that, so every rejection fell
	// through to a generic "wrong password, or the page changed" guess and the real
	// message never reached the user. Measured live (TestLiveLoginDiagnostic).
	errSpanRe = regexp.MustCompile(`(?is)<(?:span|div)[^>]*class="[^"]*\berror\b[^"]*"[^>]*>(.*?)</(?:span|div)>`)
	// The header box that says who is signed in. Codeforces wraps the handle in a
	// profile link; the bare-text-beside-logout shape is kept because some cached and
	// localised renderings produce it.
	enterBoxRe = regexp.MustCompile(`(?is)<div class="enter-or-register-box">(.*?)</div>`)
	// A logout link exists only on a logged-in page, which makes it the one
	// trustworthy signal. Profile links appear in anonymous sidebars too, so they
	// never stand on their own.
	//
	// The href is NOT "/logout": Codeforces prefixes it with a per-session token, e.g.
	//   <a href="/58041edc1b1559849bdbdced8d68f53c/logout">Logout</a>
	// so the pattern has to allow anything before the last segment. Anchoring on
	// `href="/logout` matched none of that, which meant a perfectly good session on
	// codeforces.com read as logged out — measured 2026-08-27 against a restored
	// browser session. It went unnoticed because the main host was unreachable until
	// the browser solver landed, and the mirrors used the class="logout" shape instead.
	logoutRe  = regexp.MustCompile(`(?i)class="logout"|href="[^"]*/logout`)
	profileRe = regexp.MustCompile(`href="/profile/([^"/?]+)"`)
)

// loggedInHandle reports who a page belongs to, or "" when nobody is signed in.
//
// A logout link is the anchor: it is the only marker that appears exclusively on a
// logged-in page. The handle is then the /profile/ link nearest to it.
//
// Two rules were tried and are wrong, both measured on a real logged-in
// codeforces.com page (TestLiveCodeforcesLoginGate):
//
//   - `.enter-or-register-box` does not exist when signed in — it is the logged-OUT
//     header — so anchoring on it never matched and fell through to the rule below.
//   - "the first /profile/ link in the body" is a coin flip: that page lists rated
//     users in its sidebar, and the measured order (IDika, IDika, IDika, Benq,
//     jiangly, maroonrk) only put the right one first by luck.
//
// Also deliberately NOT matched: `handle\s*=\s*"..."`. Codeforces renders rated users
// as <a ... data-handle="tourist">, which that pattern reads as a logged-in session
// belonging to whoever happened to appear in the sidebar.
func loggedInHandle(body string) string {
	anchor := logoutRe.FindStringIndex(body)
	if anchor == nil {
		return ""
	}
	best, bestDist := "", -1
	for _, m := range profileRe.FindAllStringSubmatchIndex(body, -1) {
		dist := m[0] - anchor[0]
		if dist < 0 {
			dist = -dist
		}
		if bestDist < 0 || dist < bestDist {
			bestDist, best = dist, body[m[2]:m[3]]
		}
	}
	if best != "" {
		return best
	}
	// No profile link anywhere: some compact and localised renderings put the handle
	// beside the logout link as bare text instead.
	if m := enterBoxRe.FindStringSubmatch(body); m != nil && logoutRe.MatchString(m[1]) {
		if name := htmlText(strings.SplitN(m[1], "|", 2)[0]); name != "" {
			return name
		}
	}
	return ""
}

// powPrefix is what Codeforces' own "browser is being checked" script computes: the
// smallest counter whose SHA-1 over "<counter>_<salt>" starts with four zeros. This is
// Codeforces' check, not Cloudflare's.
const powPrefix = "0000"

// powIterationCap stops a runaway loop if Codeforces lengthens the prefix. Four
// hex characters need ~65k tries on average, so a million is already generous.
const powIterationCap = 5_000_000

func solvePOW(salt string) (string, error) {
	for i := 0; i < powIterationCap; i++ {
		candidate := strconv.Itoa(i) + "_" + salt
		sum := sha1.Sum([]byte(candidate))
		if hex.EncodeToString(sum[:4])[:len(powPrefix)] == powPrefix {
			return candidate, nil
		}
	}
	return "", fmt.Errorf("proof-of-work unsolved after %d tries — Codeforces likely changed the puzzle", powIterationCap)
}

// powCookie reads the salt the server just handed us. The script takes the first
// twenty characters of whatever the cookie holds, so this does the same rather
// than assuming the value is a bare salt.
func (s *WebSession) powCookie(u *url.URL) (string, bool) {
	for _, ck := range s.jar.Cookies(u) {
		if ck.Name == "pow" {
			v := ck.Value
			if len(v) > 20 {
				v = v[:20]
			}
			return v, true
		}
	}
	return "", false
}

// get fetches a page, answering the browser check once if it appears. The session
// cookie must survive that round trip: without JSESSIONID the server treats the
// answer as unsolicited and issues a fresh puzzle instead of the page.
func (s *WebSession) get(path string) (string, error) {
	body, _, _, err := s.getPage(path)
	return body, err
}

// getPage is get plus the status code, for callers that have to tell "this host
// does not serve this path" apart from "the session died" — reporting a missing page
// as an expired session sends the user off to log in again for nothing.
func (s *WebSession) getPage(path string) (body string, status int, landed string, err error) {
	body, status, landed, err = s.rawGet(path)
	if err != nil {
		return "", status, landed, err
	}
	if !strings.Contains(body, browserCheckMarker) {
		return body, status, landed, nil
	}

	u, err := url.Parse(s.host + path)
	if err != nil {
		return "", status, landed, err
	}
	salt, ok := s.powCookie(u)
	if !ok {
		return "", status, landed, fmt.Errorf("browser check served without a pow cookie")
	}
	answer, err := solvePOW(salt)
	if err != nil {
		return "", status, landed, err
	}
	s.jar.SetCookies(u, []*http.Cookie{{Name: "pow", Value: answer, Path: "/"}})

	body, status, landed, err = s.rawGet(path)
	if err != nil {
		return "", status, landed, err
	}
	if strings.Contains(body, browserCheckMarker) {
		return "", status, landed, fmt.Errorf("browser check still served after solving it")
	}
	return body, status, landed, nil
}

func (s *WebSession) rawGet(path string) (string, int, string, error) {
	var (
		lastErr error
		// blockedErr is kept apart from lastErr because a later host's 404 must not
		// erase it: "the main host is walled off" and "no host serves this path"
		// need different answers, and only one of them is the user's problem.
		blockedErr error
		lastBody   string
		lastStatus int
		lastLanded string
	)
	// The host that answered last time goes first. With one host configured this is a
	// no-op, and it stays so that adding a host back needs no other change.
	for _, host := range s.orderedHosts() {
		req, err := http.NewRequest(http.MethodGet, host+path, nil)
		if err != nil {
			return "", 0, "", err
		}
		setBrowserHeaders(req, s.viaCloudflare)
		resp, err := s.http.Do(req)
		if err != nil {
			lastErr = err
			continue
		}
		body, readErr := io.ReadAll(resp.Body)
		resp.Body.Close()
		if readErr != nil {
			lastErr = readErr
			continue
		}
		if resp.StatusCode >= 500 {
			lastErr = fmt.Errorf("%s%s: HTTP %d", host, path, resp.StatusCode)
			continue
		}
		// A 404 is an answer about the path, not a transport failure, so it is carried
		// back rather than raised.
		if resp.StatusCode == http.StatusNotFound {
			lastBody, lastStatus, lastLanded = string(body), resp.StatusCode, landingPath(resp)
			continue
		}
		// A Cloudflare interstitial arrives as 403 with a JS challenge. Reaching
		// here means it was not cleared: either no browser solver is configured, or
		// the one that is could not pass it. Either way this host is unusable for
		// now.
		if resp.StatusCode == http.StatusForbidden || isCloudflareWall(string(body)) {
			blockedErr = fmt.Errorf("%s%s: blocked by Cloudflare%s", host, path, solverHint(s.viaCloudflare))
			lastErr = blockedErr
			continue
		}
		s.host = host
		return string(body), resp.StatusCode, landingPath(resp), nil
	}
	// Every host 404'd: that is an answer, not a transport failure, so it goes back
	// as a body the caller can explain rather than as an error it cannot.
	if lastStatus == http.StatusNotFound && blockedErr == nil {
		return lastBody, lastStatus, lastLanded, nil
	}
	// A Cloudflare wall is the finding worth reporting: it explains the failure, while
	// a 404 collected alongside it would send the user looking for a page that is there.
	if blockedErr != nil {
		return "", lastStatus, lastLanded, blockedErr
	}
	return "", lastStatus, lastLanded, lastErr
}

// landingPath is the path the response actually came from, which differs from the
// requested one whenever Codeforces redirected — clearing the Cloudflare challenge on
// /enter lands on / rather than back on /enter, and a contest that is not open sends
// the browser to the front page.
func landingPath(resp *http.Response) string {
	if resp.Request == nil || resp.Request.URL == nil {
		return ""
	}
	return resp.Request.URL.Path
}

// describeMissingForm explains why a page did not carry the form that was expected,
// instead of blaming the session for everything. The three cases look identical in
// the body but mean entirely different things to the user.
func (s *WebSession) describeMissingForm(path, landed, body string, status int) error {
	switch {
	case status == http.StatusNotFound:
		return fmt.Errorf("%s tidak ada di Codeforces (HTTP 404)", path)
	case strings.Contains(body, `name="handleOrEmail"`):
		return fmt.Errorf("sesi Codeforces kedaluwarsa — login ulang di halaman Connections")
	case landed != "" && landed != path:
		return fmt.Errorf("%s dialihkan ke %s — kontes ini tidak bisa diakses dengan sesi sekarang", path, landed)
	case strings.Contains(body, browserCheckMarker):
		return fmt.Errorf("browser check Codeforces belum terlewati untuk %s", path)
	default:
		return fmt.Errorf("halaman %s tidak dikenali (HTTP %d, %d byte) — Codeforces kemungkinan mengubah halamannya", path, status, len(body))
	}
}

// orderedHosts puts the last host that answered at the front, keeping the rest in
// their configured order.
func (s *WebSession) orderedHosts() []string {
	if s.host == "" {
		return s.hosts
	}
	out := make([]string, 0, len(s.hosts)+1)
	out = append(out, s.host)
	for _, h := range s.hosts {
		if h != s.host {
			out = append(out, h)
		}
	}
	return out
}

func isCloudflareWall(body string) bool {
	return strings.Contains(body, "Just a moment") || strings.Contains(body, "challenge-platform")
}

// setBrowserHeaders dresses a request as a browser. When the Cloudflare client is
// carrying the request it already sends a header set matched to the TLS hello it
// dialled with — and, after a solve, the exact User-Agent that cf_clearance is
// bound to — so overriding any of that here would break the very cookie the
// browser was launched to earn.
func setBrowserHeaders(req *http.Request, viaCloudflare bool) {
	if viaCloudflare {
		return
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")
}

// solverHint says what would make the main host reachable, so a 403 does not read
// as an unexplained dead end.
func solverHint(viaCloudflare bool) string {
	if viaCloudflare {
		return " (browser solver tidak bisa melewati challenge — login lewat extension di browser kamu)"
	}
	return " (browser solver belum aktif — pasang chromium atau set CF_BROWSER_PATH, atau login lewat extension)"
}
