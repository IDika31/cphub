package cloudflare

import (
	"math/rand"
	"net/http"
	"sync"
	"time"
)

// StealthOptions mirrors cloudscraper's stealth_options.
type StealthOptions struct {
	// Enabled turns the whole thing off when false. The zero value of Options
	// leaves stealth on, as cloudscraper does.
	Disabled bool
	MinDelay time.Duration
	MaxDelay time.Duration
	// HumanLikeDelays sleeps a random interval between requests.
	NoHumanLikeDelays bool
	// NoRandomizeHeaders keeps the Accept/Accept-Language/DNT set fixed.
	NoRandomizeHeaders bool
	// NoBrowserQuirks skips the per-engine header block.
	NoBrowserQuirks bool
}

// stealth is the request-shaping half of the client.
//
// One thing it cannot do that cloudscraper does: header ORDER. Python's requests
// takes an OrderedDict and writes it as given, while Go's http.Header is a map and
// net/http chooses the wire order itself (HTTP/2 mandates its own order anyway).
// Header order is part of a JA4H fingerprint, so this is a real, documented gap
// rather than an oversight.
type stealth struct {
	opts StealthOptions

	mu       sync.Mutex
	requests int
	lastAt   time.Time
}

var (
	acceptPool = []string{
		"text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
		"text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
		"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
	}
	languagePool = []string{
		"en-US,en;q=0.9",
		"en-US,en;q=0.8",
		"en-GB,en;q=0.9,en-US;q=0.8",
		"en-CA,en;q=0.9,en-US;q=0.8",
		"en-AU,en;q=0.9,en-US;q=0.8",
	}
)

func newStealth(o StealthOptions) *stealth {
	if o.MinDelay == 0 {
		o.MinDelay = 500 * time.Millisecond
	}
	if o.MaxDelay == 0 {
		o.MaxDelay = 2 * time.Second
	}
	if o.MaxDelay < o.MinDelay {
		o.MaxDelay = o.MinDelay
	}
	return &stealth{opts: o}
}

// delay sleeps like a person reading a page: a random interval, occasionally a
// longer pause, never more than ten seconds, and nothing at all before the first
// request. Honours the context so a cancelled request does not sit out its nap.
func (s *stealth) delay(done <-chan struct{}) {
	if s.opts.Disabled || s.opts.NoHumanLikeDelays {
		return
	}
	s.mu.Lock()
	first := s.requests == 0
	s.requests++
	s.mu.Unlock()
	if first {
		return
	}

	span := s.opts.MaxDelay - s.opts.MinDelay
	wait := s.opts.MinDelay
	if span > 0 {
		wait += time.Duration(rand.Int63n(int64(span)))
	}
	if rand.Float64() < 0.1 {
		wait = wait * 3 / 2 // the occasional longer pause
	}
	if wait > 10*time.Second {
		wait = 10 * time.Second
	}
	if wait < 100*time.Millisecond {
		return
	}
	select {
	case <-time.After(wait):
	case <-done:
	}
}

// apply adds the varying headers a browser session shows over time. Anything the
// caller or the browser profile already set is left alone: a contradiction between
// the profile and these is worse than uniformity.
func (s *stealth) apply(req *http.Request) {
	if s.opts.Disabled || s.opts.NoRandomizeHeaders {
		return
	}
	if req.Header.Get("Accept") == "" {
		req.Header.Set("Accept", acceptPool[rand.Intn(len(acceptPool))])
	}
	if req.Header.Get("Accept-Language") == "" {
		req.Header.Set("Accept-Language", languagePool[rand.Intn(len(languagePool))])
	}
	// Roughly half of real traffic carries DNT, so always sending it (or never)
	// is the tell.
	if req.Header.Get("DNT") == "" && rand.Float64() < 0.5 {
		req.Header.Set("DNT", "1")
	}
}
