package cloudflare

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/dop251/goja"
)

// The legacy IUAM page hides a small arithmetic program and expects its result,
// posted back no earlier than the page's own setTimeout allows. cloudscraper runs
// that program in a JavaScript engine rather than reimplementing the arithmetic,
// because Cloudflare varied the expression shape constantly; goja is that engine
// here, in pure Go.
var (
	challengeFormRe = regexp.MustCompile(`(?is)<form[^>]+id="challenge-form"[^>]*>(.*?)</form>`)
	formTagRe       = regexp.MustCompile(`(?is)<form[^>]+id="challenge-form"[^>]*>`)
	attrPairRe      = regexp.MustCompile(`([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*"([^"]*)"`)
	inputTagRe      = regexp.MustCompile(`(?i)<input[^>]*>`)
	jsBlockRe       = regexp.MustCompile(`(?s)setTimeout\(function\(\)\s*\{\s*(var s,t,o,p,b,r,e,a,k,i,n,g,f.*?a\.value\s*=\s*[^\r\n]+)`)
	// The assignment becomes a bare expression, so the program's last value IS the
	// answer and the DOM-stripping pass below cannot mistake it for DOM noise.
	answerAssignRe = regexp.MustCompile(`(?m)^[ \t]*a\.value\s*=\s*(.+)$`)
	domNoiseRe     = regexp.MustCompile(`\s{3,}[a-z](?: = |\.).+`)
	delayRe        = regexp.MustCompile(`},\s*(\d{3,5})\)`)
)

// answerIUAM solves the puzzle on the page and submits it. On success Cloudflare
// sets cf_clearance in the jar, and the caller re-sends its original request.
func (c *Client) answerIUAM(ctx context.Context, pageURL *url.URL, body string) error {
	form := formTagRe.FindString(body)
	if form == "" {
		return fmt.Errorf("%s: iuam page has no challenge-form", pageURL)
	}
	attrs := attrsOf(form)
	action := attrs["action"]
	if action == "" {
		return fmt.Errorf("%s: challenge-form has no action", pageURL)
	}
	target, err := pageURL.Parse(action)
	if err != nil {
		return err
	}
	method := strings.ToUpper(attrs["method"])
	if method == "" {
		method = http.MethodPost
	}

	answer, err := solveIUAM(body, pageURL.Hostname())
	if err != nil {
		return fmt.Errorf("%s: %w", pageURL, err)
	}

	fields := url.Values{}
	for name, value := range formInputs(body) {
		fields.Set(name, value)
	}
	fields.Set("jschl_answer", answer)

	// Cloudflare times the reply: answering before the page's own delay is the
	// single most common reason a correct answer is rejected.
	select {
	case <-time.After(c.iuamDelayFor(body)):
	case <-ctx.Done():
		return ctx.Err()
	}

	req, err := http.NewRequestWithContext(ctx, method, target.String(), nil)
	if err != nil {
		return err
	}
	if method == http.MethodGet {
		req.URL.RawQuery = fields.Encode()
	} else {
		req.Body, req.ContentLength, req.GetBody = formBody(fields)
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	}
	req.Header.Set("Referer", pageURL.String())
	req.Header.Set("Origin", pageURL.Scheme+"://"+pageURL.Host)
	c.browser.applyHeaders(req)

	resp, _, err := c.send(req)
	if err != nil {
		return err
	}
	// A wrong answer comes back as the challenge page again; the caller's next
	// attempt will see that and stop. Redirects are followed by http.Client, so a
	// 200 here already means the clearance cookie landed.
	if resp.StatusCode >= 400 && resp.StatusCode != http.StatusForbidden {
		return fmt.Errorf("%s: iuam answer rejected with HTTP %d", target, resp.StatusCode)
	}
	return nil
}

// solveIUAM extracts the challenge program, strips the DOM manipulation the page
// does around it, and evaluates what is left. The sanitising mirrors cloudscraper:
// the snippet derives the hostname by building an <a> element, which no engine can
// do without a DOM, so those lines go and t.length becomes the length outright.
func solveIUAM(body, domain string) (string, error) {
	block := jsBlockRe.FindStringSubmatch(body)
	if block == nil {
		return "", fmt.Errorf("iuam challenge script not found — Cloudflare changed its shape")
	}
	js := answerAssignRe.ReplaceAllString(block[1], "$1")
	js = domNoiseRe.ReplaceAllString(js, "")
	js = strings.ReplaceAll(js, "t.length", strconv.Itoa(len(domain)))

	vm := goja.New()
	value, err := vm.RunString(js)
	if err != nil {
		return "", fmt.Errorf("evaluating iuam challenge: %w", err)
	}
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		return "", fmt.Errorf("iuam challenge evaluated to nothing")
	}
	// Cloudflare wants ten decimal places; the page's own code ends in toFixed(10).
	return strconv.FormatFloat(value.ToFloat(), 'f', 10, 64), nil
}

// iuamDelayFor honours the page's setTimeout when it is readable, and the
// configured default otherwise.
func (c *Client) iuamDelayFor(body string) time.Duration {
	if m := delayRe.FindStringSubmatch(body); m != nil {
		if ms, err := strconv.Atoi(m[1]); err == nil && ms > 0 && ms < 30000 {
			return time.Duration(ms) * time.Millisecond
		}
	}
	return c.opts.IUAMDelay
}

// formInputs collects the challenge form's own inputs (r, jschl_vc, pass, md)
// rather than assuming which ones this variant ships.
func formInputs(body string) map[string]string {
	out := map[string]string{}
	inner := challengeFormRe.FindStringSubmatch(body)
	if inner == nil {
		return out
	}
	for _, tag := range inputTagRe.FindAllString(inner[1], -1) {
		attrs := attrsOf(tag)
		if name := attrs["name"]; name != "" && name != "jschl_answer" {
			out[name] = attrs["value"]
		}
	}
	return out
}

func attrsOf(tag string) map[string]string {
	attrs := map[string]string{}
	for _, m := range attrPairRe.FindAllStringSubmatch(tag, -1) {
		attrs[strings.ToLower(m[1])] = m[2]
	}
	return attrs
}
