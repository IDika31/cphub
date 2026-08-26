package cloudflare

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"sort"
	"strings"
)

// Tokens are Cloudflare's cookies together with the User-Agent that earned them.
// The pairing matters: Cloudflare ties cf_clearance to the User-Agent and the IP,
// so handing the cookies to curl or a browser without this exact UA fails.
// cloudscraper returns the same tuple from get_tokens().
type Tokens struct {
	Cookies   map[string]string
	UserAgent string
}

// Header renders the pair as a Cookie header value, cloudscraper's
// get_cookie_string().
func (t Tokens) Header() string {
	names := make([]string, 0, len(t.Cookies))
	for name := range t.Cookies {
		names = append(names, name)
	}
	sort.Strings(names) // stable output, so callers can diff or log it
	parts := make([]string, 0, len(names))
	for _, name := range names {
		parts = append(parts, name+"="+t.Cookies[name])
	}
	return strings.Join(parts, "; ")
}

// Tokens reads the Cloudflare cookies this client currently holds for a URL.
func (c *Client) Tokens(u *url.URL) Tokens {
	out := Tokens{Cookies: map[string]string{}, UserAgent: c.Browser().Headers["User-Agent"]}
	wanted := map[string]bool{}
	for _, name := range cfCookies {
		wanted[name] = true
	}
	for _, ck := range c.http.Jar.Cookies(u) {
		if wanted[ck.Name] && ck.Value != "" {
			out.Cookies[ck.Name] = ck.Value
		}
	}
	return out
}

// GetTokens fetches a URL, clearing whatever Cloudflare puts in the way, and
// returns the cookies plus the User-Agent for handing to another tool.
//
// An empty cookie set is an error rather than an empty success: it means the site
// had no Cloudflare cookies to give, and a caller that fed that to curl would be
// debugging the wrong thing.
func GetTokens(ctx context.Context, rawURL string, o Options) (Tokens, error) {
	c, err := New(o)
	if err != nil {
		return Tokens{}, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return Tokens{}, err
	}
	resp, err := c.Do(req)
	if err != nil {
		return Tokens{}, err
	}
	if resp.StatusCode >= 400 {
		return Tokens{}, fmt.Errorf("%s: HTTP %d", rawURL, resp.StatusCode)
	}
	tokens := c.Tokens(req.URL)
	if len(tokens.Cookies) == 0 {
		return tokens, fmt.Errorf("%s: no cloudflare cookies were set — is the site actually behind a challenge?", rawURL)
	}
	return tokens, nil
}

// GetCookieString is GetTokens rendered as a Cookie header plus the User-Agent.
func GetCookieString(ctx context.Context, rawURL string, o Options) (cookie, userAgent string, err error) {
	tokens, err := GetTokens(ctx, rawURL, o)
	if err != nil {
		return "", "", err
	}
	return tokens.Header(), tokens.UserAgent, nil
}
