package model

import (
	"encoding/json"
	"strings"
	"testing"
)

// The Connections page decides "terhubung" vs "belum login" for a self-hosted
// TLX purely from providerUsername, because the row already exists (and is
// is_connected) the moment the extension registers the host. The column was
// written by LinkTLXCustom but missing from this struct, so GET /api/accounts
// never returned it and a logged-in instance still read "belum login".
func TestLinkedAccountSerializesProviderUsername(t *testing.T) {
	b, err := json.Marshal(LinkedAccount{ProviderUsername: "nasi-ayam-1134"})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if !strings.Contains(string(b), `"providerUsername":"nasi-ayam-1134"`) {
		t.Fatalf("providerUsername not exposed to the client: %s", b)
	}
	// Omitted while unset, so "belum login" stays the honest default.
	b, _ = json.Marshal(LinkedAccount{})
	if strings.Contains(string(b), "providerUsername") {
		t.Fatalf("empty providerUsername should be omitted: %s", b)
	}
}
