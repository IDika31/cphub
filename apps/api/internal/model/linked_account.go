package model

import (
	"time"

	"github.com/google/uuid"
)

type LinkedAccount struct {
	ID             uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	UserID         uuid.UUID `gorm:"type:uuid;not null;index" json:"userId"`
	Provider       string    `gorm:"not null;size:20" json:"provider"` // codeforces, tlx, google
	ProviderUserID string    `gorm:"size:100" json:"providerUserId"`
	Handle         string    `gorm:"size:100" json:"handle"`
	AccessToken    string    `gorm:"size:500" json:"-"`
	RefreshToken   string    `gorm:"size:500" json:"-"`
	TokenExpiry    *time.Time `json:"-"`
	Rating         int       `gorm:"default:0" json:"rating"`
	MaxRating      int       `gorm:"default:0" json:"maxRating"`
	AvatarURL      string    `gorm:"size:500" json:"avatarUrl,omitempty"`
	IsConnected    bool      `gorm:"default:true" json:"isConnected"`
	LinkedAt       time.Time `json:"linkedAt"`
	CreatedAt      time.Time  `json:"createdAt"`
	UpdatedAt      time.Time  `json:"updatedAt"`

	User User `gorm:"foreignKey:UserID" json:"-"`
}
