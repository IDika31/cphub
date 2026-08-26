package cloudflare

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// maxBody caps what is read into memory to classify a response. Challenge pages
// are a few kilobytes; this is only here so a hostile or broken server cannot make
// the client eat the heap.
const maxBody = 8 << 20

// Do sends a request, answering any challenge it can and re-sending until the real
// page arrives or the attempts run out. The returned response's body is already
// buffered, so it can be read more than once and needs no Close.
//
// The order of operations follows cloudscraper's hijacked request(): throttle,
// refresh a stale session, apply stealth, send, dispatch on the challenge, and —
// if the answer is still 403 — refresh the session and try the whole thing again.
func (c *Client) Do(req *http.Request) (*http.Response, error) {
	if err := c.throttle(req.Context()); err != nil {
		return nil, err
	}
	defer c.release()

	c.seedClearance(req.URL)
	if err := bufferBody(req); err != nil {
		return nil, err
	}
	if c.shouldRefresh() {
		c.refresh(req.Context(), req.URL)
	}

	resp, err := c.solveLoop(req)
	if !c.wants403Recovery(resp, err) {
		return resp, err
	}
	for c.take403Retry() {
		if !c.refresh(req.Context(), req.URL) {
			break
		}
		retryResp, retryErr := c.solveLoop(req)
		resp, err = retryResp, retryErr
		if retryErr == nil && retryResp.StatusCode != http.StatusForbidden {
			c.clear403()
			return retryResp, nil
		}
	}
	return resp, err
}

// solveLoop is one session's worth of attempts: send, classify, answer, repeat.
func (c *Client) solveLoop(req *http.Request) (*http.Response, error) {
	var (
		lastResp *http.Response
		lastKind = NoChallenge
	)
	for attempt := 0; attempt < c.opts.MaxAttempts; attempt++ {
		attemptReq, err := cloneRequest(req)
		if err != nil {
			return nil, err
		}
		c.stealth.delay(req.Context().Done())
		c.stealth.apply(attemptReq)
		c.Browser().applyHeaders(attemptReq)

		resp, body, err := c.send(attemptReq)
		if err != nil {
			c.proxies.ReportFailure(c.proxies.Last())
			return nil, err
		}
		c.proxies.ReportSuccess(c.proxies.Last())
		lastResp, lastKind = resp, ClassifyResponse(resp, body)

		if lastKind == NoChallenge {
			return resp, nil
		}
		if c.opts.disabled(lastKind) {
			return resp, challengeErr(attemptReq.URL, resp, lastKind, nil)
		}
		if err := c.answer(req.Context(), attemptReq.URL, lastKind, body); err != nil {
			return resp, challengeErr(attemptReq.URL, resp, lastKind, err)
		}
	}
	return lastResp, challengeErr(req.URL, lastResp, lastKind, errors.New("attempts exhausted"))
}

// answer clears one gate, or says why it cannot.
//
// A Solver is tried first for everything it could possibly help with: it is a real
// browser, so it outranks every heuristic below it.
func (c *Client) answer(ctx context.Context, u *url.URL, gate Challenge, body string) error {
	switch gate {
	case Blocked:
		return errors.New("firewall rule: no challenge to solve, the request itself is refused")
	case RateLimited:
		return errors.New("rate limited: wait rather than retry")
	case IUAM:
		return c.answerIUAM(ctx, u, body)
	}

	if c.opts.Solver != nil {
		cookies, err := c.opts.Solver.Solve(ctx, u, gate, body)
		if err != nil {
			return err
		}
		if len(cookies) > 0 {
			c.http.Jar.SetCookies(u, cookies)
			return nil
		}
		return errors.New("solver returned no cookies")
	}

	// Turnstile and captcha gates are solvable by a provider. A managed challenge
	// sometimes embeds a Turnstile widget, and when it does the same path works —
	// which is why the site key, not the gate name, decides here.
	if c.captcha != nil && siteKeyRe.MatchString(body) {
		return c.answerCaptchaGate(ctx, u, body, gate)
	}
	if gate == Turnstile || gate == Captcha {
		return errors.New("no captcha provider configured (set Options.Captcha)")
	}
	return errors.New("this gate runs its own JavaScript: configure Options.Solver with a browser")
}

// Get fetches a page and returns its text.
func (c *Client) Get(ctx context.Context, rawURL string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return "", err
	}
	resp, err := c.Do(req)
	if err != nil {
		return "", err
	}
	body, err := io.ReadAll(resp.Body)
	return string(body), err
}

// PostForm submits a form, carrying the Origin and Referer a browser would.
func (c *Client) PostForm(ctx context.Context, rawURL string, form url.Values) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, rawURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Origin", req.URL.Scheme+"://"+req.URL.Host)
	req.Header.Set("Referer", rawURL)
	req.Header.Set("Sec-Fetch-Site", "same-origin")
	resp, err := c.Do(req)
	if err != nil {
		return "", err
	}
	body, err := io.ReadAll(resp.Body)
	return string(body), err
}

// send performs one round trip and buffers the body so the response can be both
// classified and handed to the caller.
func (c *Client) send(req *http.Request) (*http.Response, string, error) {
	c.mu.Lock()
	c.requests++
	c.mu.Unlock()

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, "", err
	}
	raw, err := io.ReadAll(io.LimitReader(resp.Body, maxBody))
	resp.Body.Close()
	if err != nil {
		return nil, "", err
	}
	resp.Body = io.NopCloser(bytes.NewReader(raw))
	if resp.StatusCode == http.StatusForbidden {
		c.mu.Lock()
		c.last403At = time.Now()
		c.mu.Unlock()
	}
	return resp, string(raw), nil
}

// wants403Recovery reports whether a result is the kind of 403 that a fresh
// session might fix — which is any of them, since Cloudflare answers both a plain
// block and a challenge with 403.
func (c *Client) wants403Recovery(resp *http.Response, err error) bool {
	if c.opts.NoAutoRefreshOn403 {
		return false
	}
	var chErr *ChallengeError
	if errors.As(err, &chErr) && chErr.Kind == Blocked {
		// A firewall rule is not about the session, so refreshing it is churn.
		return false
	}
	return resp != nil && resp.StatusCode == http.StatusForbidden
}

func (c *Client) take403Retry() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.retries403 >= c.opts.Max403Retries {
		return false
	}
	c.retries403++
	return true
}

func (c *Client) clear403() {
	c.mu.Lock()
	c.retries403 = 0
	c.last403At = time.Time{}
	c.mu.Unlock()
}

// seedClearance installs a clearance cookie earned elsewhere, once per host.
func (c *Client) seedClearance(u *url.URL) {
	if c.opts.Clearance == "" || u == nil {
		return
	}
	c.mu.Lock()
	seeded := c.seeded[u.Host]
	c.seeded[u.Host] = true
	c.mu.Unlock()
	if seeded {
		return
	}
	c.http.Jar.SetCookies(u, []*http.Cookie{{
		Name:   "cf_clearance",
		Value:  c.opts.Clearance,
		Path:   "/",
		Domain: u.Hostname(),
	}})
}

// bufferBody makes a request re-sendable: a retry needs the body again, and a
// one-shot reader cannot give it.
func bufferBody(req *http.Request) error {
	if req.Body == nil || req.GetBody != nil {
		return nil
	}
	raw, err := io.ReadAll(req.Body)
	req.Body.Close()
	if err != nil {
		return err
	}
	req.Body = io.NopCloser(bytes.NewReader(raw))
	req.ContentLength = int64(len(raw))
	req.GetBody = func() (io.ReadCloser, error) {
		return io.NopCloser(bytes.NewReader(raw)), nil
	}
	return nil
}

func cloneRequest(req *http.Request) (*http.Request, error) {
	out := req.Clone(req.Context())
	if req.GetBody != nil {
		body, err := req.GetBody()
		if err != nil {
			return nil, err
		}
		out.Body = body
	}
	return out, nil
}

// formBody makes a form payload that can be replayed, so a challenge answer or a
// retried POST does not send an already-drained reader.
func formBody(form url.Values) (io.ReadCloser, int64, func() (io.ReadCloser, error)) {
	encoded := form.Encode()
	get := func() (io.ReadCloser, error) {
		return io.NopCloser(strings.NewReader(encoded)), nil
	}
	body, _ := get()
	return body, int64(len(encoded)), get
}

func challengeErr(u *url.URL, resp *http.Response, kind Challenge, cause error) *ChallengeError {
	e := &ChallengeError{Kind: kind, Cause: cause}
	if u != nil {
		e.URL = u.String()
	}
	if resp != nil {
		e.Status = resp.StatusCode
		e.RayID = RayID(resp.Header)
	}
	return e
}
