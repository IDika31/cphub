package model

import (
	"crypto/rand"
	"encoding/hex"
	"time"

	"github.com/google/uuid"
)

type User struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	Email        string    `gorm:"uniqueIndex;not null;size:255" json:"email"`
	PasswordHash string    `gorm:"size:255" json:"-"`
	Name         string    `gorm:"not null;size:100" json:"name"`
	AvatarURL    string    `gorm:"size:500" json:"avatarUrl,omitempty"`
	AuthProvider string    `gorm:"not null;default:'email';size:20" json:"authProvider"` // email, google
	GoogleID     string    `gorm:"size:100" json:"-"`
	IsOnboarded  bool      `gorm:"default:false" json:"isOnboarded"`
	// ExtensionSecret is this account's own HMAC key for extension traffic.
	// Never serialised: it is handed out only through the extension-key endpoint.
	ExtensionSecret string     `gorm:"size:64" json:"-"`
	LastLoginAt     *time.Time `json:"lastLoginAt,omitempty"`
	CreatedAt       time.Time  `json:"createdAt"`
	UpdatedAt       time.Time  `json:"updatedAt"`
}

// NewExtensionSecret mints a 256-bit hex key for extension HMAC signing.
func NewExtensionSecret() string {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		// crypto/rand failing is fatal for auth material; refuse to hand out a
		// guessable key.
		panic("cannot generate extension secret: " + err.Error())
	}
	return hex.EncodeToString(buf)
}
