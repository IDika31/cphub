package cloudflare

import (
	"math/rand"
	"net/url"
	"strings"
	"sync"
	"time"
)

// ProxyStrategy is how the next proxy is chosen, as in cloudscraper's
// proxy_options.rotation_strategy.
type ProxyStrategy string

const (
	// Sequential walks the list in order.
	Sequential ProxyStrategy = "sequential"
	// Random picks uniformly.
	Random ProxyStrategy = "random"
	// Smart prefers the proxy with the best success ratio so far.
	Smart ProxyStrategy = "smart"
)

type proxyStats struct {
	success, failure int
	bannedAt         time.Time
}

// ProxyManager rotates a proxy pool and benches the ones that fail.
type ProxyManager struct {
	mu       sync.Mutex
	proxies  []*url.URL
	stats    map[string]*proxyStats
	strategy ProxyStrategy
	banFor   time.Duration
	next     int
	last     *url.URL
}

// NewProxyManager parses the pool. Entries may be full URLs
// (http://user:pass@host:port, socks5://host:port) or bare host:port, which is
// read as http, matching cloudscraper. Unparseable entries are dropped rather than
// failing the whole client.
func NewProxyManager(proxies []string, strategy ProxyStrategy, banFor time.Duration) *ProxyManager {
	if strategy == "" {
		strategy = Sequential
	}
	if banFor == 0 {
		banFor = 5 * time.Minute
	}
	m := &ProxyManager{stats: map[string]*proxyStats{}, strategy: strategy, banFor: banFor}
	for _, raw := range proxies {
		raw = strings.TrimSpace(raw)
		if raw == "" {
			continue
		}
		if !strings.Contains(raw, "://") {
			raw = "http://" + raw
		}
		u, err := url.Parse(raw)
		if err != nil || u.Host == "" {
			continue
		}
		m.proxies = append(m.proxies, u)
		m.stats[u.String()] = &proxyStats{}
	}
	return m
}

// Empty reports whether there is nothing to rotate, so callers can skip the whole
// proxy path.
func (m *ProxyManager) Empty() bool {
	if m == nil {
		return true
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.proxies) == 0
}

// Next returns the proxy to use, or nil when the pool is empty.
//
// When every proxy is benched it un-benches the one that has been out longest and
// uses it: a scraper with a stale pool should degrade, not stop.
func (m *ProxyManager) Next() *url.URL {
	if m == nil {
		return nil
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if len(m.proxies) == 0 {
		return nil
	}

	var available []*url.URL
	for _, p := range m.proxies {
		st := m.stats[p.String()]
		if st.bannedAt.IsZero() || time.Since(st.bannedAt) > m.banFor {
			available = append(available, p)
		}
	}
	if len(available) == 0 {
		oldest := m.proxies[0]
		for _, p := range m.proxies {
			if m.stats[p.String()].bannedAt.Before(m.stats[oldest.String()].bannedAt) {
				oldest = p
			}
		}
		m.stats[oldest.String()].bannedAt = time.Time{}
		m.last = oldest
		return oldest
	}

	switch m.strategy {
	case Random:
		m.last = available[rand.Intn(len(available))]
		return m.last
	case Smart:
		best, bestScore := available[0], -1.0
		for _, p := range available {
			st := m.stats[p.String()]
			// The +0.1 keeps an untried proxy ahead of one that has only failed,
			// and avoids dividing by zero — cloudscraper's own trick.
			score := float64(st.success) / (float64(st.success+st.failure) + 0.1)
			if score > bestScore {
				best, bestScore = p, score
			}
		}
		m.last = best
		return best
	default:
		p := available[m.next%len(available)]
		m.next++
		m.last = p
		return p
	}
}

// Last is the proxy handed out most recently, so a caller can report how it went.
// With requests in flight concurrently this is approximate — exact attribution
// would mean threading the proxy through the round trip, which net/http does not
// expose. cloudscraper has the same imprecision.
func (m *ProxyManager) Last() *url.URL {
	if m == nil {
		return nil
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.last
}

// ReportSuccess clears any ban and feeds the smart strategy.
func (m *ProxyManager) ReportSuccess(p *url.URL) {
	if m == nil || p == nil {
		return
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if st, ok := m.stats[p.String()]; ok {
		st.success++
		st.bannedAt = time.Time{}
	}
}

// ReportFailure benches a proxy for the configured ban window.
func (m *ProxyManager) ReportFailure(p *url.URL) {
	if m == nil || p == nil {
		return
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if st, ok := m.stats[p.String()]; ok {
		st.failure++
		st.bannedAt = time.Now()
	}
}
