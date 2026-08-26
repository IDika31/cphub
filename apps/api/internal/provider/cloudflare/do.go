package cloudflare

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"net/url"
	"strings"
)

// maxBody caps what is read into memory to classify a response. Challenge pages
// are a few kilobytes; this is only here so a hostile or broken server cannot make
// the client eat the heap.
const maxBody = 8 << 20

// Do sends a request, answering any challenge it can and re-sending until the real
// page arrives or the attempts run out. The returned response's body is already
// buffered, so it can be read more than once and needs no Close (closing is still
// harmless).
//
// A gate that cannot be cleared comes back as a *ChallengeError together with the
// challenge response itself, so a caller can inspect or log the page.
func (c *Client) Do(req *http.Request) (*http.Response, error) {
	if err := c.seedClearance(req.URL); err != nil {
		return nil, err
	}
	if req.Body != nil && req.GetBody == nil {
		// A retry needs the body again, and a one-shot reader cannot give it.
		raw, err := io.ReadAll(req.Body)
		req.Body.Close()
		if err != nil {
			return nil, err
		}
		req.Body = io.NopCloser(bytes.NewReader(raw))
		req.ContentLength = int64(len(raw))
		req.GetBody = func() (io.ReadCloser, error) {
			return io.NopCloser(bytes.NewReader(raw)), nil
		}
	}

	var (
		lastResp *http.Response
		lastKind Challenge
	)
	for attempt := 0; attempt < c.opts.MaxAttempts; attempt++ {
		attemptReq, err := cloneRequest(req)
		if err != nil {
			return nil, err
		}
		c.browser.applyHeaders(attemptReq)

		resp, body, err := c.send(attemptReq)
		if err != nil {
			return nil, err
		}
		lastResp, lastKind = resp, ClassifyResponse(resp, body)

		switch {
		case lastKind == NoChallenge:
			return resp, nil

		case lastKind == IUAM:
			if err := c.answerIUAM(req.Context(), attemptReq.URL, body); err != nil {
				return resp, err
			}

		case lastKind.NeedsBrowser() && c.opts.Solver != nil:
			cookies, err := c.opts.Solver.Solve(req.Context(), attemptReq.URL, lastKind, body)
			if err != nil {
				return resp, err
			}
			if len(cookies) == 0 {
				return resp, challengeErr(attemptReq.URL, resp, lastKind)
			}
			c.http.Jar.SetCookies(attemptReq.URL, cookies)

		default:
			return resp, challengeErr(attemptReq.URL, resp, lastKind)
		}
	}
	return lastResp, challengeErr(req.URL, lastResp, lastKind)
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
	return resp, string(raw), nil
}

// seedClearance installs a clearance cookie earned elsewhere, once per host.
func (c *Client) seedClearance(u *url.URL) error {
	if c.opts.Clearance == "" || u == nil || c.seeded[u.Host] {
		return nil
	}
	c.http.Jar.SetCookies(u, []*http.Cookie{{
		Name:   "cf_clearance",
		Value:  c.opts.Clearance,
		Path:   "/",
		Domain: u.Hostname(),
	}})
	c.seeded[u.Host] = true
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

func challengeErr(u *url.URL, resp *http.Response, kind Challenge) *ChallengeError {
	e := &ChallengeError{Kind: kind, URL: u.String()}
	if resp != nil {
		e.Status = resp.StatusCode
		e.RayID = RayID(resp.Header)
	}
	return e
}
