package secret

import (
	"encoding/base64"
	"strings"
	"testing"
)

const key32Hex = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

func TestRoundTrip(t *testing.T) {
	box, err := NewBox(key32Hex)
	if err != nil {
		t.Fatalf("NewBox: %v", err)
	}
	const pw = "s3cret-p4ssw0rd!"
	sealed, err := box.Seal(pw)
	if err != nil {
		t.Fatalf("Seal: %v", err)
	}
	if strings.Contains(sealed, pw) {
		t.Fatal("ciphertext contains the plaintext")
	}
	got, err := box.Open(sealed)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	if got != pw {
		t.Errorf("Open = %q, want %q", got, pw)
	}
}

// Two seals of the same secret must differ: a repeated nonce would leak that two
// accounts share a password.
func TestSealUsesFreshNonce(t *testing.T) {
	box, _ := NewBox(key32Hex)
	a, _ := box.Seal("same")
	b, _ := box.Seal("same")
	if a == b {
		t.Error("two seals of the same plaintext are identical")
	}
}

func TestNoKeyRefusesToStore(t *testing.T) {
	box, err := NewBox("")
	if err != ErrNoKey {
		t.Fatalf("NewBox(\"\") err = %v, want ErrNoKey", err)
	}
	if _, err := box.Seal("x"); err != ErrNoKey {
		t.Errorf("Seal on nil box = %v, want ErrNoKey", err)
	}
	if _, err := box.Open("x"); err != ErrNoKey {
		t.Errorf("Open on nil box = %v, want ErrNoKey", err)
	}
}

func TestWrongKeyFailsClosed(t *testing.T) {
	good, _ := NewBox(key32Hex)
	sealed, _ := good.Seal("hello")
	other, _ := NewBox(base64.StdEncoding.EncodeToString([]byte("an entirely different 32b key!!!")))
	if _, err := other.Open(sealed); err == nil {
		t.Fatal("Open succeeded under the wrong key")
	}
}

func TestShortKeyRejected(t *testing.T) {
	if _, err := NewBox("abcd"); err == nil {
		t.Fatal("a 2-byte key was accepted")
	}
}
