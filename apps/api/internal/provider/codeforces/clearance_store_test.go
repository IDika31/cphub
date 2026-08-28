package codeforces

import (
	"context"
	"testing"
	"time"
)

type fakeStore struct {
	value, ua string
	loads     int
	saved     [][2]string
	savedTTL  time.Duration
}

func (f *fakeStore) Load(context.Context) (string, string, bool) {
	f.loads++
	if f.value == "" || f.ua == "" {
		return "", "", false
	}
	return f.value, f.ua, true
}

func (f *fakeStore) Save(_ context.Context, value, ua string, ttl time.Duration) {
	f.saved = append(f.saved, [2]string{value, ua})
	f.savedTTL = ttl
}

// resetClearance puts the package back to "nothing solved, nothing stored" so one
// test's clearance cannot answer the next one's lookup.
func resetClearance(t *testing.T) {
	t.Helper()
	t.Cleanup(func() {
		SetClearanceStore(nil)
		clearanceCache.mu.Lock()
		clearanceCache.value, clearanceCache.ua = "", ""
		clearanceCache.mu.Unlock()
	})
	SetClearanceStore(nil)
	clearanceCache.mu.Lock()
	clearanceCache.value, clearanceCache.ua = "", ""
	clearanceCache.mu.Unlock()
}

// The point of the store: a clearance solved before this process started is still
// good, so it must be found without launching anything.
func TestCachedClearanceReadsThroughToTheStore(t *testing.T) {
	resetClearance(t)
	store := &fakeStore{value: "abc123", ua: "Mozilla/5.0 (X11)"}
	SetClearanceStore(store)

	value, ua := cachedClearance()
	if value != "abc123" || ua != "Mozilla/5.0 (X11)" {
		t.Fatalf("cachedClearance() = %q/%q, want the stored pair", value, ua)
	}
	// Seeded into memory, so the next caller does not go back to Redis for it.
	if got := store.loads; got != 1 {
		t.Errorf("store read %d times, want 1", got)
	}
	if value, _ := cachedClearance(); value != "abc123" {
		t.Errorf("second read = %q, want the memory copy", value)
	}
	if store.loads != 1 {
		t.Errorf("store read %d times after a warm memory hit, want 1", store.loads)
	}
}

// Half a pair cannot be replayed — the cookie is bound to the User-Agent that earned
// it — so a store holding only one of the two is the same as an empty one.
func TestCachedClearanceIgnoresHalfAStoredPair(t *testing.T) {
	resetClearance(t)
	SetClearanceStore(&fakeStore{value: "abc123"})

	if value, ua := cachedClearance(); value != "" || ua != "" {
		t.Errorf("cachedClearance() = %q/%q, want empty", value, ua)
	}
}

func TestNoStoreIsNotAnError(t *testing.T) {
	resetClearance(t)
	if value, ua := cachedClearance(); value != "" || ua != "" {
		t.Errorf("cachedClearance() = %q/%q with no store, want empty", value, ua)
	}
}
