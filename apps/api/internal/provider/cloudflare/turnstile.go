package cloudflare

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strings"
)

var (
	// Turnstile keys are 0x-prefixed and longer than the 40-char reCAPTCHA keys
	// cloudscraper's regex assumed, so the length here is a range, not a constant.
	siteKeyRe     = regexp.MustCompile(`data-sitekey="([0-9A-Za-z_\-]{20,64})"`)
	formActionRe  = regexp.MustCompile(`(?is)<form[^>]*action="([^"]+)"`)
	dataRayRe     = regexp.MustCompile(`data-ray="([^"]+)"`)
	captchaKindRe = regexp.MustCompile(`name="cf_captcha_kind"\s+value="([^"]+)"`)
	anyInputRe    = regexp.MustCompile(`(?i)<input[^>]*>`)
)

// answerCaptchaGate clears a Turnstile or captcha page through the configured
// provider, then submits the form the page carries.
//
// Cloudflare binds the solved token to the page's own form fields, so the fields
// are replayed rather than reconstructed — the same reason RegisterContest in the
// codeforces provider replays its form.
func (c *Client) answerCaptchaGate(ctx context.Context, pageURL *url.URL, body string, gate Challenge) error {
	if c.captcha == nil {
		return fmt.Errorf("%s: no captcha provider configured (set Options.Captcha)", gate)
	}
	key := siteKeyRe.FindStringSubmatch(body)
	if key == nil {
		return fmt.Errorf("%s at %s: no data-sitekey on the page", gate, pageURL)
	}

	kind := TurnstileCaptcha
	tokenField := "cf-turnstile-response"
	if gate == Captcha {
		kind, tokenField = HCaptcha, "h-captcha-response"
		// cf_captcha_kind is 're' for reCAPTCHA and 'h' for hCaptcha; the token
		// field name follows from it, and guessing wrong wastes a paid solve.
		if m := captchaKindRe.FindStringSubmatch(body); m != nil && strings.HasPrefix(m[1], "re") {
			kind, tokenField = ReCaptcha, "g-recaptcha-response"
		}
	}

	token, err := c.captcha.Solve(ctx, kind, pageURL.String(), key[1])
	if err != nil {
		return fmt.Errorf("%s via %s: %w", gate, c.captcha.Name(), err)
	}

	fields := url.Values{}
	for name, value := range allInputs(body) {
		fields.Set(name, value)
	}
	fields.Set(tokenField, token)
	if gate == Captcha {
		// reCAPTCHA's own field name is what Cloudflare reads even for hCaptcha,
		// which is why cloudscraper sends both.
		fields.Set("g-recaptcha-response", token)
		if m := dataRayRe.FindStringSubmatch(body); m != nil {
			fields.Set("id", m[1])
		}
		if m := captchaKindRe.FindStringSubmatch(body); m != nil {
			fields.Set("cf_captcha_kind", m[1])
		}
	}

	target := pageURL
	if m := formActionRe.FindStringSubmatch(body); m != nil {
		if resolved, err := pageURL.Parse(unescapeHTML(m[1])); err == nil {
			target = resolved
		}
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, target.String(), nil)
	if err != nil {
		return err
	}
	req.Body, req.ContentLength, req.GetBody = formBody(fields)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Origin", pageURL.Scheme+"://"+pageURL.Host)
	req.Header.Set("Referer", pageURL.String())
	c.browser.applyHeaders(req)

	resp, _, err := c.send(req)
	if err != nil {
		return err
	}
	if resp.StatusCode == http.StatusForbidden {
		return fmt.Errorf("%s: token rejected by Cloudflare (HTTP 403, ray %s)", gate, RayID(resp.Header))
	}
	return nil
}

// allInputs collects every named input on the page, token fields excluded — those
// are supplied by the solve.
func allInputs(body string) map[string]string {
	out := map[string]string{}
	for _, tag := range anyInputRe.FindAllString(body, -1) {
		attrs := attrsOf(tag)
		name := attrs["name"]
		switch name {
		case "", "cf-turnstile-response", "g-recaptcha-response", "h-captcha-response":
			continue
		}
		out[name] = unescapeHTML(attrs["value"])
	}
	return out
}

// unescapeHTML undoes the entities Cloudflare puts in form actions and values.
// Only the five that matter appear there, so this stays a replacer rather than
// pulling in an HTML parser.
func unescapeHTML(s string) string {
	return strings.NewReplacer(
		"&amp;", "&", "&lt;", "<", "&gt;", ">", "&quot;", `"`, "&#39;", "'",
	).Replace(s)
}
