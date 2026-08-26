package cloudflare

import (
	"math/rand"
	"strings"

	utls "github.com/refraction-networking/utls"
)

// The fingerprint database, cloudscraper's browsers.json in Go form.
//
// Two deliberate departures from the original. First, cloudscraper ships ~7700
// User-Agent strings, but the newest are from 2019 (Chrome 76, Firefox 67) — a
// stale UA is itself a bot signal now, so this carries a small pool of current
// builds instead of a large pool of suspicious ones. Second, cloudscraper fakes
// the TLS fingerprint by handing OpenSSL a cipher string; utls replays the whole
// ClientHello (ciphers, extensions, their order, GREASE), so the cipher list is
// not something this package has to name.

type deviceClass int

const (
	desktop deviceClass = iota
	mobile
)

type uaEntry struct {
	agent    string
	browser  string // "chrome" or "firefox"
	platform string // linux, windows, darwin, android, ios
	device   deviceClass
	// platformHint is the sec-ch-ua-platform value Chrome sends on this platform.
	platformHint string
}

var userAgents = []uaEntry{
	{"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36", "chrome", "windows", desktop, `"Windows"`},
	{"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36", "chrome", "windows", desktop, `"Windows"`},
	{"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36", "chrome", "darwin", desktop, `"macOS"`},
	{"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36", "chrome", "linux", desktop, `"Linux"`},
	{"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36", "chrome", "android", mobile, `"Android"`},
	{"Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.0.0 Mobile/15E148 Safari/604.1", "chrome", "ios", mobile, `"iOS"`},

	{"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0", "firefox", "windows", desktop, ""},
	{"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0", "firefox", "windows", desktop, ""},
	{"Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0", "firefox", "darwin", desktop, ""},
	{"Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0", "firefox", "linux", desktop, ""},
	{"Mozilla/5.0 (Android 14; Mobile; rv:133.0) Gecko/133.0 Firefox/133.0", "firefox", "android", mobile, ""},
}

// BrowserFilter narrows which fingerprint gets picked, mirroring cloudscraper's
// browser={'browser':..,'platform':..,'mobile':..,'desktop':..,'custom':..} dict.
type BrowserFilter struct {
	Browser  string // "chrome", "firefox", or empty for either
	Platform string // linux, windows, darwin, android, ios, or empty for any
	Desktop  *bool  // nil means allowed
	Mobile   *bool  // nil means allowed
	// Custom replaces the User-Agent outright while keeping the rest of the
	// matching profile. cloudscraper's 'custom' key.
	Custom string
}

func allowed(flag *bool) bool { return flag == nil || *flag }

// PickBrowser builds a fingerprint from the filter. An impossible filter (both
// device classes off, an unknown platform) falls back to desktop Chrome rather
// than failing: a scraper that cannot start is worse than one that starts on the
// most common profile.
func PickBrowser(f BrowserFilter) Browser {
	var pool []uaEntry
	for _, e := range userAgents {
		if f.Browser != "" && e.browser != strings.ToLower(f.Browser) {
			continue
		}
		if f.Platform != "" && e.platform != strings.ToLower(f.Platform) {
			continue
		}
		if e.device == desktop && !allowed(f.Desktop) {
			continue
		}
		if e.device == mobile && !allowed(f.Mobile) {
			continue
		}
		pool = append(pool, e)
	}
	if len(pool) == 0 {
		return Chrome
	}
	return browserFor(pool[rand.Intn(len(pool))], f.Custom)
}

// browserFor turns a UA row into a full fingerprint: the hello of that engine and
// the header set that engine sends, with the platform hints made consistent.
func browserFor(e uaEntry, custom string) Browser {
	base := Chrome
	if e.browser == "firefox" {
		base = Firefox
	}
	headers := make(map[string]string, len(base.Headers)+1)
	for k, v := range base.Headers {
		headers[k] = v
	}
	headers["User-Agent"] = e.agent
	if custom != "" {
		headers["User-Agent"] = custom
	}
	if e.browser == "chrome" {
		if e.platformHint != "" {
			headers["sec-ch-ua-platform"] = e.platformHint
		}
		if e.device == mobile {
			headers["sec-ch-ua-mobile"] = "?1"
		}
	}
	hello := base.Hello
	if e.browser == "chrome" && e.device == mobile && e.platform == "ios" {
		// iOS Chrome is Safari underneath, so a Chrome hello there is a
		// contradiction a fingerprinter can see.
		hello = utls.HelloIOS_Auto
	}
	return Browser{Name: e.browser, Hello: hello, Headers: headers}
}
