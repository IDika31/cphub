package cloudflare

import (
	"errors"
	"net/http"
	"strings"
	"testing"
)

// Bodies trimmed to the markers that matter. The managed and blocked samples carry
// the exact strings codeforces.com and a firewall-rule page served in August 2026.
const (
	managedBody = `<!DOCTYPE html><html><head><title>Just a moment...</title></head><body>
<div id="cf-wrapper"><noscript>Enable JavaScript and cookies to continue</noscript>
<script>window._cf_chl_opt={cvId:'3',cType:'managed',cRay:'a30e82e23d4b978a'};</script>
<script src="/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1"></script></body></html>`

	iuamBody = `<!DOCTYPE html><html><body><form id="challenge-form" action="/cdn-cgi/l/chk_jschl?__cf_chl_jschl_tk__=tok" method="POST">
<input type="hidden" name="r" value="R-VALUE"/>
<input type="hidden" name="jschl_vc" value="VC-VALUE"/>
<input type="hidden" name="pass" value="PASS-VALUE"/>
</form></body></html>`

	turnstileBody = `<html><body><form><div class="cf-turnstile"></div>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script>
<input name="cf-turnstile-response"/></form></body></html>`

	blockedBody = `<html><head><title>Attention Required! | Cloudflare</title></head><body>
<h1>Error 1020</h1><div class="cf-error-details">Ray ID: abc</div></body></html>`

	captchaBody = `<html><body><script>window._cf_chl_opt={cType:'interactive'};</script>
<script src="https://hcaptcha.com/1/api.js"></script><div class="h-captcha"></div></body></html>`

	realPage = `<html><body><h1>Watermelon</h1><div class="problem-statement">...</div></body></html>`
)

func cfHeader(extra ...string) http.Header {
	h := http.Header{}
	h.Set("Server", "cloudflare")
	h.Set("cf-ray", "a30e82e23d4b978a-HKG")
	for i := 0; i+1 < len(extra); i += 2 {
		h.Set(extra[i], extra[i+1])
	}
	return h
}

func TestClassify(t *testing.T) {
	cases := []struct {
		name   string
		status int
		header http.Header
		body   string
		want   Challenge
	}{
		{"managed challenge", 403, cfHeader("cf-mitigated", "challenge"), managedBody, Managed},
		{"legacy iuam", 503, cfHeader(), iuamBody, IUAM},
		{"turnstile widget", 403, cfHeader(), turnstileBody, Turnstile},
		{"captcha gate", 403, cfHeader(), captchaBody, Captcha},
		{"firewall block", 403, cfHeader(), blockedBody, Blocked},
		{"rate limited", 429, cfHeader(), "<html>too many requests</html>", RateLimited},
		{"real page behind cloudflare", 200, cfHeader(), realPage, NoChallenge},
		{"not cloudflare at all", 403, http.Header{}, "<html>plain forbidden</html>", NoChallenge},
		// A body can arrive without the proxy headers (a cached copy, a mirror that
		// strips them); the markers alone still have to be enough.
		{"markers without headers", 403, http.Header{}, managedBody, Managed},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := Classify(tc.status, tc.header, tc.body); got != tc.want {
				t.Fatalf("Classify() = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestChallengeCapabilities(t *testing.T) {
	if !IUAM.Solvable() {
		t.Error("IUAM must be solvable — it is the whole point of the iuam solver")
	}
	for _, kind := range []Challenge{Managed, Turnstile, Captcha} {
		if kind.Solvable() {
			t.Errorf("%v claims to be solvable without a browser", kind)
		}
		if !kind.NeedsBrowser() {
			t.Errorf("%v should report that it needs a browser", kind)
		}
	}
	// Blocked is neither: a firewall rule has nothing to solve, so promising a
	// browser would fix it would send a caller down the wrong path.
	if Blocked.Solvable() || Blocked.NeedsBrowser() {
		t.Error("Blocked must be reported as unsolvable, not as browser-solvable")
	}
}

func TestChallengeErrorIsNeedsBrowser(t *testing.T) {
	err := &ChallengeError{Kind: Managed, URL: "https://codeforces.com/enter", Status: 403, RayID: "ray-1"}
	if !errors.Is(err, ErrNeedsBrowser) {
		t.Fatal("managed challenge should match ErrNeedsBrowser")
	}
	if errors.Is(&ChallengeError{Kind: Blocked}, ErrNeedsBrowser) {
		t.Fatal("a firewall block must not claim a browser would help")
	}
	if got := err.Error(); !strings.Contains(got, "ray-1") || !strings.Contains(got, "managed-challenge") {
		t.Fatalf("error text should name the gate and the ray: %q", got)
	}
}

func TestIsCloudflareAndRayID(t *testing.T) {
	if IsCloudflare(nil) || RayID(nil) != "" {
		t.Fatal("nil headers must not be reported as cloudflare")
	}
	if !IsCloudflare(cfHeader()) {
		t.Fatal("cf-ray should identify cloudflare")
	}
	if got := RayID(cfHeader()); got != "a30e82e23d4b978a-HKG" {
		t.Fatalf("RayID() = %q", got)
	}
}
