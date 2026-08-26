package cloudflare

import (
	"context"
	"crypto/tls"
	"fmt"
	"net"
	"net/http"
	"sync"
	"time"

	utls "github.com/refraction-networking/utls"
	"golang.org/x/net/http2"
)

// Browser is a fingerprint pair: the TLS hello to send, and the headers a real
// build of that browser sends with it. Mixing them — Chrome's hello with Firefox's
// User-Agent — is itself a signal, so they travel together.
type Browser struct {
	Name    string
	Hello   utls.ClientHelloID
	Headers map[string]string
}

// Chrome is Chrome 131 on Windows 10/11.
//
// Accept-Encoding is deliberately absent: Go's transport adds its own gzip header
// and only decompresses what it asked for, so advertising br here would hand back
// a body nothing in this package can read. It is the one place the header set
// knowingly differs from the real browser.
var Chrome = Browser{
	Name:  "chrome",
	Hello: utls.HelloChrome_Auto,
	Headers: map[string]string{
		"User-Agent":                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
		"sec-ch-ua":                 `"Chromium";v="131", "Not_A Brand";v="24", "Google Chrome";v="131"`,
		"sec-ch-ua-mobile":          "?0",
		"sec-ch-ua-platform":        `"Windows"`,
		"Upgrade-Insecure-Requests": "1",
		"Accept":                    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
		"Sec-Fetch-Site":            "none",
		"Sec-Fetch-Mode":            "navigate",
		"Sec-Fetch-User":            "?1",
		"Sec-Fetch-Dest":            "document",
		"Accept-Language":           "en-US,en;q=0.9",
	},
}

// Firefox is Firefox 133 on Windows. No sec-ch-ua family: Firefox does not send
// client hints, and sending them with a Firefox hello is a contradiction.
var Firefox = Browser{
	Name:  "firefox",
	Hello: utls.HelloFirefox_Auto,
	Headers: map[string]string{
		"User-Agent":                "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
		"Accept":                    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
		"Accept-Language":           "en-US,en;q=0.5",
		"Upgrade-Insecure-Requests": "1",
		"Sec-Fetch-Site":            "none",
		"Sec-Fetch-Mode":            "navigate",
		"Sec-Fetch-User":            "?1",
		"Sec-Fetch-Dest":            "document",
	},
}

// applyHeaders fills in the browser's headers without overwriting anything the
// caller set deliberately.
func (b Browser) applyHeaders(req *http.Request) {
	for name, value := range b.Headers {
		if req.Header.Get(name) == "" {
			req.Header.Set(name, value)
		}
	}
}

// transport dials with a browser hello and then speaks whatever ALPN chose.
//
// The dispatch is not optional: Go's http.Transport only upgrades to HTTP/2 for
// connections it made itself, so a utls conn that negotiated h2 would be fed
// HTTP/1.1 bytes and the server would answer with SETTINGS frames that the h1
// parser reports as a malformed response. Measured against Codeforces: m1 speaks
// only HTTP/1.1, m3 speaks h2, so both cases are live even inside one host list.
type transport struct {
	browser Browser
	h1      *http.Transport
	h2      *http2.Transport

	mu    sync.Mutex
	proto map[string]string // authority -> negotiated ALPN
}

func newTransport(b Browser, timeout time.Duration) *transport {
	t := &transport{browser: b, proto: map[string]string{}}
	t.h1 = &http.Transport{
		DialTLSContext:      t.dial([]string{"http/1.1"}),
		MaxIdleConnsPerHost: 4,
		IdleConnTimeout:     90 * time.Second,
		TLSHandshakeTimeout: timeout,
	}
	t.h2 = &http2.Transport{
		DialTLSContext: func(ctx context.Context, network, addr string, _ *tls.Config) (net.Conn, error) {
			return t.dial([]string{"h2"})(ctx, network, addr)
		},
	}
	return t
}

func (t *transport) dial(alpn []string) func(context.Context, string, string) (net.Conn, error) {
	return func(ctx context.Context, network, addr string) (net.Conn, error) {
		host, _, err := net.SplitHostPort(addr)
		if err != nil {
			return nil, err
		}
		raw, err := (&net.Dialer{Timeout: 20 * time.Second}).DialContext(ctx, network, addr)
		if err != nil {
			return nil, err
		}
		// NextProtos narrows the preset's ALPN list to the one protocol this
		// transport can speak; every other byte of the hello stays the browser's.
		conn := utls.UClient(raw, &utls.Config{ServerName: host, NextProtos: alpn}, t.browser.Hello)
		if err := conn.HandshakeContext(ctx); err != nil {
			raw.Close()
			return nil, fmt.Errorf("tls handshake with %s hello: %w", t.browser.Name, err)
		}
		return conn, nil
	}
}

// negotiated asks the host once which protocol it wants, with the browser's full
// ALPN list, and remembers the answer. One extra handshake per host beats guessing
// wrong on every request.
func (t *transport) negotiated(ctx context.Context, authority string) (string, error) {
	t.mu.Lock()
	if p, ok := t.proto[authority]; ok {
		t.mu.Unlock()
		return p, nil
	}
	t.mu.Unlock()

	conn, err := t.dial([]string{"h2", "http/1.1"})(ctx, "tcp", authority)
	if err != nil {
		return "", err
	}
	proto := "http/1.1"
	if u, ok := conn.(*utls.UConn); ok {
		if p := u.ConnectionState().NegotiatedProtocol; p != "" {
			proto = p
		}
	}
	conn.Close()

	t.mu.Lock()
	t.proto[authority] = proto
	t.mu.Unlock()
	return proto, nil
}

func (t *transport) RoundTrip(req *http.Request) (*http.Response, error) {
	authority := req.URL.Host
	if req.URL.Port() == "" {
		authority = net.JoinHostPort(authority, "443")
	}
	if req.URL.Scheme != "https" {
		return http.DefaultTransport.RoundTrip(req)
	}
	proto, err := t.negotiated(req.Context(), authority)
	if err != nil {
		return nil, err
	}
	if proto == http2.NextProtoTLS {
		return t.h2.RoundTrip(req)
	}
	return t.h1.RoundTrip(req)
}
