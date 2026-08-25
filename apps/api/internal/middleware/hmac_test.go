package middleware

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"testing"

	"github.com/IDika31/cphub/api/internal/model"
)

// Pins the signing scheme: hex(HMAC-SHA256(extension secret, raw body)) over the
// body alone. The browser extension reproduces this in shared/crypto.ts, so a
// change here without a change there silently breaks every sync.
func TestSignatureScheme(t *testing.T) {
	const secret = "test-secret-0123456789"
	const body = `{"provider":"codeforces"}`
	const want = "75ad2fcab6aabc96f9c506ca328b81eafc92a0179f3c28aa51a4f3bad71b15b7"

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(body))
	got := hex.EncodeToString(mac.Sum(nil))

	if got != want {
		t.Fatalf("signature scheme changed: got %s, want %s", got, want)
	}
}

func TestNewExtensionSecretIsUniqueAndHex(t *testing.T) {
	seen := make(map[string]bool)
	for i := 0; i < 64; i++ {
		s := model.NewExtensionSecret()
		if len(s) != 64 {
			t.Fatalf("want 64 hex chars (256 bits), got %d: %s", len(s), s)
		}
		if _, err := hex.DecodeString(s); err != nil {
			t.Fatalf("not hex: %v", err)
		}
		if seen[s] {
			t.Fatal("duplicate secret generated")
		}
		seen[s] = true
	}
}
