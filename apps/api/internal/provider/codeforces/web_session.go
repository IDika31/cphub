package codeforces

import (
	"crypto/sha1"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// WebSession talks to the Codeforces web UI, which is the only place submitting a
// solution and registering for a contest exist — the official API is read-only and
// has been "write-methods coming soon" since 2013.
//
// codeforces.com itself now answers 403 behind a Cloudflare challenge, verified
// from both a desktop and the production host. The m1/m3 mirrors do not: they run
// Codeforces' own proof-of-work check instead, which is a plain hash puzzle and
// needs no browser. Hence the mirror hosts below rather than the canonical one.
type WebSession struct {
	http  *http.Client
	hosts []string
	host  string // the mirror that last answered
	// ftaa/bfaa are the fingerprint pair the login associated with this session;
	// handle is who it belongs to. See web_auth.go.
	ftaa   string
	bfaa   string
	handle string
}

// WebHosts are tried in order, best first.
//
// codeforces.com is listed first on purpose even though it answers 403 behind a
// Cloudflare challenge today: it is the only host that serves the whole site, and
// the moment it is reachable again — a different egress IP, a relaxed rule — every
// feature here works without a code change. The mirrors are the fallback. m2 sits
// behind the same wall as the main host, so it is deliberately absent.
//
// The wall is not a TLS fingerprint: the 403 page carries cf_chl_opt with
// cType:'managed', i.e. a Cloudflare managed challenge that wants JavaScript. A
// Chrome ClientHello replayed with utls (both ALPN h2 and http/1.1) was measured
// against it and still got the same 403. Passing it needs a real browser engine,
// not a better socket. The client that proved this lives in
// internal/provider/cloudflare (TestLiveCodeforces); the mirrors need none of it,
// so this file stays on the stdlib transport.
//
// The mirrors are NOT a full Codeforces. Measured unauthenticated (see
// TestLiveMirrorSurface): /enter serves the real login page, every /contest/* path
// serves that same login page, and /problemset/*, /contests, /submissions/* and
// /contestRegistration/* answer 404. They exist for live contests, which is why the
// contest section is what they carry.
var WebHosts = []string{"https://codeforces.com", "https://m1.codeforces.com", "https://m3.codeforces.com"}

// MirrorHosts is kept for callers that want to skip the main host entirely.
var MirrorHosts = []string{"https://m1.codeforces.com", "https://m3.codeforces.com"}

func NewWebSession() (*WebSession, error) {
	jar, err := cookiejar.New(nil)
	if err != nil {
		return nil, err
	}
	return &WebSession{
		http:  &http.Client{Jar: jar, Timeout: 45 * time.Second},
		hosts: WebHosts,
		host:  WebHosts[0],
	}, nil
}

// Host is the mirror in use, for building absolute URLs in log lines and replies.
func (s *WebSession) Host() string { return s.host }

const browserCheckMarker = "browser is being checked"

var (
	csrfRe = regexp.MustCompile(`csrf='([0-9a-f]{16,})'`)
	// Codeforces reports a rejected form in an element whose class merely CONTAINS
	// "error", and it is a div rather than a span:
	//   <div class="subscription-row error ">Invalid handle/email or password</div>
	// The old span-only pattern matched none of that, so every rejection fell
	// through to a generic "wrong password, or the page changed" guess and the real
	// message never reached the user. Measured against m1 (TestLiveLoginDiagnostic).
	errSpanRe = regexp.MustCompile(`(?is)<(?:span|div)[^>]*class="[^"]*\berror\b[^"]*"[^>]*>(.*?)</(?:span|div)>`)
	// The header box that says who is signed in. On the mirrors the handle sits in
	// it as bare text beside a logout link; the main host wraps it in a profile
	// link instead.
	enterBoxRe = regexp.MustCompile(`(?is)<div class="enter-or-register-box">(.*?)</div>`)
	// A logout link exists only on a logged-in page, which makes it the one
	// trustworthy signal. Profile links appear in anonymous sidebars too, so they
	// never stand on their own.
	logoutRe  = regexp.MustCompile(`(?i)class="logout"|href="/logout`)
	profileRe = regexp.MustCompile(`href="/profile/([^"/?]+)"`)
)

// loggedInHandle reports who a page belongs to, or "" when nobody is signed in.
//
// Deliberately NOT matched: the old `handle\s*=\s*"..."` pattern. Codeforces
// renders rated users as <a ... data-handle="tourist">, which that pattern happily
// reads as a logged-in session belonging to whoever appeared in the sidebar.
func loggedInHandle(body string) string {
	if m := enterBoxRe.FindStringSubmatch(body); m != nil && logoutRe.MatchString(m[1]) {
		box := m[1]
		if p := profileRe.FindStringSubmatch(box); p != nil {
			return p[1]
		}
		// The mirror shape: " IDika | <a class="logout" href="/logout">Logout</a> ".
		if name := htmlText(strings.SplitN(box, "|", 2)[0]); name != "" {
			return name
		}
	}
	if logoutRe.MatchString(body) {
		if m := profileRe.FindStringSubmatch(body); m != nil {
			return m[1]
		}
	}
	return ""
}

// powPrefix and powHash are what the mirror's own script computes: the smallest
// counter whose SHA-1, taken over "<counter>_<salt>", starts with four zeros.
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
	for _, ck := range s.http.Jar.Cookies(u) {
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
	body, err := s.rawGet(path)
	if err != nil {
		return "", err
	}
	if !strings.Contains(body, browserCheckMarker) {
		return body, nil
	}

	u, err := url.Parse(s.host + path)
	if err != nil {
		return "", err
	}
	salt, ok := s.powCookie(u)
	if !ok {
		return "", fmt.Errorf("browser check served without a pow cookie")
	}
	answer, err := solvePOW(salt)
	if err != nil {
		return "", err
	}
	s.http.Jar.SetCookies(u, []*http.Cookie{{Name: "pow", Value: answer, Path: "/"}})

	body, err = s.rawGet(path)
	if err != nil {
		return "", err
	}
	if strings.Contains(body, browserCheckMarker) {
		return "", fmt.Errorf("browser check still served after solving it")
	}
	return body, nil
}

func (s *WebSession) rawGet(path string) (string, error) {
	var lastErr error
	// The host that answered last time goes first: otherwise every request pays a
	// wasted round trip to a host that is currently walled off.
	for _, host := range s.orderedHosts() {
		req, err := http.NewRequest(http.MethodGet, host+path, nil)
		if err != nil {
			return "", err
		}
		setBrowserHeaders(req)
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
		// A Cloudflare interstitial arrives as 403 with a JS challenge — no cookie
		// we can compute answers it, so the host is simply unusable right now.
		if resp.StatusCode == http.StatusForbidden || isCloudflareWall(string(body)) {
			lastErr = fmt.Errorf("%s%s: blocked by Cloudflare", host, path)
			continue
		}
		s.host = host
		return string(body), nil
	}
	return "", lastErr
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

func setBrowserHeaders(req *http.Request) {
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")
}
