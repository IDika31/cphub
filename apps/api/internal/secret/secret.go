// Package secret encrypts credentials that have to survive a restart.
//
// A Codeforces password is full account access — Codeforces has no second factor —
// so it is stored only when the deployment sets CRED_ENC_KEY, and only as AES-GCM
// ciphertext under that key. Deriving a key from something already in the config
// (a handle, JWT_SECRET) would be obfuscation, not encryption: anyone with the
// database would also have the key.
package secret

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
)

// ErrNoKey means the deployment has no CRED_ENC_KEY, so nothing may be stored.
var ErrNoKey = errors.New("CRED_ENC_KEY belum diset — password tidak akan disimpan")

type Box struct {
	aead cipher.AEAD
}

// NewBox accepts a 32-byte key as 64 hex characters or standard base64. An empty
// key yields a nil Box, which every method reports as ErrNoKey rather than
// silently storing plaintext.
func NewBox(key string) (*Box, error) {
	if key == "" {
		return nil, ErrNoKey
	}
	raw, err := decodeKey(key)
	if err != nil {
		return nil, err
	}
	if len(raw) != 32 {
		return nil, fmt.Errorf("CRED_ENC_KEY harus 32 byte (64 hex atau base64), dapat %d byte", len(raw))
	}
	block, err := aes.NewCipher(raw)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &Box{aead: aead}, nil
}

func decodeKey(key string) ([]byte, error) {
	if raw, err := hex.DecodeString(key); err == nil {
		return raw, nil
	}
	raw, err := base64.StdEncoding.DecodeString(key)
	if err != nil {
		return nil, fmt.Errorf("CRED_ENC_KEY bukan hex maupun base64 yang sah")
	}
	return raw, nil
}

// Seal returns base64(nonce||ciphertext).
func (b *Box) Seal(plaintext string) (string, error) {
	if b == nil {
		return "", ErrNoKey
	}
	nonce := make([]byte, b.aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	sealed := b.aead.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(sealed), nil
}

func (b *Box) Open(encoded string) (string, error) {
	if b == nil {
		return "", ErrNoKey
	}
	raw, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return "", fmt.Errorf("ciphertext rusak: %w", err)
	}
	if len(raw) < b.aead.NonceSize() {
		return "", errors.New("ciphertext terlalu pendek")
	}
	nonce, body := raw[:b.aead.NonceSize()], raw[b.aead.NonceSize():]
	out, err := b.aead.Open(nil, nonce, body, nil)
	if err != nil {
		// Wrong key or tampered data — both mean "cannot use this credential".
		return "", errors.New("gagal mendekripsi credential — CRED_ENC_KEY berubah?")
	}
	return string(out), nil
}
