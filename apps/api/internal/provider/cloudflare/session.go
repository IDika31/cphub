package cloudflare

import (
	"context"
	"net/http"
	"net/url"
	"time"
)

// Session health, cloudscraper's v3.0.0 headline feature.
//
// The problem it solves is real: a cf_clearance cookie and a fingerprint that
// worked an hour ago start drawing 403s, and retrying the same request with the
// same identity keeps drawing them. The fix is to throw the session away — clear
// Cloudflare's cookies, pick a new fingerprint, re-solve — and try once more.
//
// Two defaults deliberately differ from cloudscraper. MinRequestInterval is 0
// here, not 1s: stealth delays already space requests out, and applying both makes
// every request wait twice. MaxConcurrent is unlimited rather than 1, because this
// package is a library inside a server, not a single-threaded scraper script.

// cfCookies are the cookies a refresh drops. Anything else in the jar (the site's
// own session) is left alone — clearing that would log the user out.
var cfCookies = []string{"cf_clearance", "cf_chl_2", "cf_chl_prog", "cf_chl_rc_ni", "cf_turnstile", "__cf_bm"}

// throttle enforces the minimum gap between requests and the concurrency cap.
func (c *Client) throttle(ctx context.Context) error {
	if c.sem != nil {
		select {
		case c.sem <- struct{}{}:
		case <-ctx.Done():
			return ctx.Err()
		}
	}
	if c.opts.MinRequestInterval <= 0 {
		return nil
	}
	c.mu.Lock()
	wait := c.opts.MinRequestInterval - time.Since(c.lastRequestAt)
	c.lastRequestAt = time.Now().Add(max(wait, 0))
	c.mu.Unlock()
	if wait <= 0 {
		return nil
	}
	select {
	case <-time.After(wait):
	case <-ctx.Done():
		return ctx.Err()
	}
	return nil
}

func (c *Client) release() {
	if c.sem != nil {
		select {
		case <-c.sem:
		default:
		}
	}
}

// shouldRefresh reports whether the session has gone stale: too old, or recently
// 403'd. The second condition is what makes repeated 403s converge on a refresh
// instead of on more 403s.
func (c *Client) shouldRefresh() bool {
	if c.opts.SessionRefreshInterval <= 0 {
		return false
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if time.Since(c.sessionStart) > c.opts.SessionRefreshInterval {
		return true
	}
	return !c.last403At.IsZero() && time.Since(c.last403At) < time.Minute
}

// refresh drops Cloudflare's cookies, takes a new fingerprint, and re-opens the
// origin so the next request starts from a solved state. It reports whether the
// origin answered, so the caller knows whether retrying is worth anything.
func (c *Client) refresh(ctx context.Context, u *url.URL) bool {
	c.clearCloudflareCookies(u)

	c.mu.Lock()
	c.sessionStart = time.Now()
	c.requests = 0
	rotate := !c.opts.NoRotateFingerprint
	c.mu.Unlock()

	if rotate {
		// A fresh fingerprint is the point of the refresh: the same hello and UA
		// that just earned a 403 will earn another one.
		c.setBrowser(PickBrowser(c.opts.Filter))
	}

	origin := &url.URL{Scheme: u.Scheme, Host: u.Host, Path: "/"}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, origin.String(), nil)
	if err != nil {
		return false
	}
	c.browser.applyHeaders(req)
	resp, _, err := c.send(req)
	if err != nil {
		return false
	}
	switch resp.StatusCode {
	case http.StatusOK, http.StatusMovedPermanently, http.StatusFound, http.StatusNotModified:
		return true
	}
	return false
}

// clearCloudflareCookies expires Cloudflare's cookies in the jar. Go's cookiejar
// has no delete call, so they are overwritten with an already-past expiry, which
// the jar treats as a removal.
func (c *Client) clearCloudflareCookies(u *url.URL) {
	if u == nil {
		return
	}
	dead := make([]*http.Cookie, 0, len(cfCookies))
	past := time.Now().Add(-time.Hour)
	for _, name := range cfCookies {
		dead = append(dead, &http.Cookie{Name: name, Value: "", Path: "/", Expires: past, MaxAge: -1})
	}
	c.http.Jar.SetCookies(u, dead)
	c.mu.Lock()
	delete(c.seeded, u.Host)
	c.mu.Unlock()
}

// setBrowser swaps the fingerprint for this client, transport included: a new UA
// with the old hello is a contradiction, so both move together.
func (c *Client) setBrowser(b Browser) {
	c.mu.Lock()
	c.browser = b
	c.mu.Unlock()
	c.tr.setBrowser(b)
}

func max(a, b time.Duration) time.Duration {
	if a > b {
		return a
	}
	return b
}
