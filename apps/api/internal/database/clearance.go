package database

import (
	"context"
	"encoding/json"
	"log"
	"time"
)

// clearanceKey holds one pair for the whole deployment. It is not per user: the
// cookie is bound to this machine's IP and the solving browser's User-Agent, so
// every user's requests replay the same one.
const clearanceKey = "cf:clearance"

type storedClearance struct {
	Value string `json:"value"`
	UA    string `json:"ua"`
}

// ClearanceCache keeps a solved Cloudflare clearance in Redis so a restart, a
// deploy or a second API process does not throw away a cookie that is still live.
// It satisfies codeforces.ClearanceStore.
//
// Redis is optional everywhere else in this codebase and stays optional here: with
// no cache configured every method is a no-op and the caller falls back to solving,
// which is exactly the behaviour before this existed.
type ClearanceCache struct{}

func NewClearanceCache() ClearanceCache { return ClearanceCache{} }

func (ClearanceCache) Load(ctx context.Context) (value, ua string, ok bool) {
	if Cache == nil {
		return "", "", false
	}
	raw, err := Cache.Get(ctx, clearanceKey).Result()
	if err != nil {
		// A miss is the normal case after the TTL runs out, so it is not logged.
		return "", "", false
	}
	var stored storedClearance
	if err := json.Unmarshal([]byte(raw), &stored); err != nil {
		return "", "", false
	}
	if stored.Value == "" || stored.UA == "" {
		return "", "", false
	}
	return stored.Value, stored.UA, true
}

func (ClearanceCache) Save(ctx context.Context, value, ua string, ttl time.Duration) {
	if Cache == nil {
		return
	}
	blob, err := json.Marshal(storedClearance{Value: value, UA: ua})
	if err != nil {
		return
	}
	if err := Cache.Set(ctx, clearanceKey, blob, ttl).Err(); err != nil {
		log.Printf("[database] could not store the Cloudflare clearance: %v", err)
	}
}
