package model

import (
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
	LastLoginAt  *time.Time `json:"lastLoginAt,omitempty"`
	CreatedAt    time.Time  `json:"createdAt"`
	UpdatedAt    time.Time  `json:"updatedAt"`
}
