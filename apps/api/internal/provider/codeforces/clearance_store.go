package codeforces

import (
	"context"
	"log"
	"sync"
	"time"
)

// A solved cf_clearance outlives the process that earned it, and that is the whole
// point of this file.
//
// The cookie belongs to this machine's IP and the solving browser's User-Agent, not
// to a user or a request, so it is valid for as long as Cloudflare says — measured
// in tens of minutes, not seconds. Keeping it only in memory meant every restart and
// every deploy threw away a live clearance and paid another Chromium launch: 432 MB
// peak PSS on a box with 892 MB, for a cookie that was still good.
//
// The store is an interface rather than a Redis client so this package keeps knowing
// nothing about the database layer; cmd/main wires the real one in.
type ClearanceStore interface {
	// Load returns the stored pair. ok is false when there is nothing usable —
	// including when the backing store is unreachable, which is not an error worth
	// propagating: the caller's fallback is to solve again.
	Load(ctx context.Context) (value, ua string, ok bool)
	// Save stores the pair for at most ttl. Failures are the store's to log.
	Save(ctx context.Context, value, ua string, ttl time.Duration)
}

// ClearanceTTL is how long a solved clearance is offered to later requests.
//
// Cloudflare does not publish the cookie's lifetime and it varies by zone policy;
// thirty minutes is the figure usually observed for a managed challenge. Twenty is
// deliberately short of that: serving a cookie Cloudflare has already retired costs
// a 403 and then a solve anyway, so the cheap mistake is expiring a little early.
const ClearanceTTL = 20 * time.Minute

var clearanceStore struct {
	mu    sync.Mutex
	store ClearanceStore
}

// SetClearanceStore points this package at somewhere durable. Called once at
// startup; passing nil turns persistence off, which is what the tests do.
func SetClearanceStore(s ClearanceStore) {
	clearanceStore.mu.Lock()
	clearanceStore.store = s
	clearanceStore.mu.Unlock()
}

func activeClearanceStore() ClearanceStore {
	clearanceStore.mu.Lock()
	defer clearanceStore.mu.Unlock()
	return clearanceStore.store
}

// loadStoredClearance seeds the in-memory pair from the store. Returns whether it
// found one, so the caller can tell "nothing stored" from "seeded".
func loadStoredClearance() bool {
	store := activeClearanceStore()
	if store == nil {
		return false
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	value, ua, ok := store.Load(ctx)
	if !ok || value == "" || ua == "" {
		return false
	}
	clearanceCache.mu.Lock()
	clearanceCache.value, clearanceCache.ua = value, ua
	clearanceCache.mu.Unlock()
	log.Printf("[cf-web] reusing the stored Cloudflare clearance — no browser launch needed")
	return true
}

func storeClearance(value, ua string) {
	store := activeClearanceStore()
	if store == nil || value == "" || ua == "" {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	store.Save(ctx, value, ua, ClearanceTTL)
}
