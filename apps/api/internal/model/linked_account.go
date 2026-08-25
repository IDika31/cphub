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
	// tlx-custom keeps the instance host in Handle, so the account name on that
	// instance needs its own column. It is also what tells "registered by the
	// extension" apart from "logged in" — the row exists either way.
	ProviderUsername string `gorm:"size:100" json:"providerUsername,omitempty"`
	// DisplayName is a label only — what the user typed for this instance in the
	// extension. Handle keeps the host because lookups and generated URLs use it.
	DisplayName  string     `gorm:"size:100" json:"displayName,omitempty"`
	AccessToken  string     `gorm:"size:500" json:"-"`
	RefreshToken string     `gorm:"size:500" json:"-"`
	TokenExpiry  *time.Time `json:"-"`
	Rating       int        `gorm:"default:0" json:"rating"`
	MaxRating    int        `gorm:"default:0" json:"maxRating"`
	AvatarURL    string     `gorm:"size:500" json:"avatarUrl,omitempty"`
	IsConnected  bool       `gorm:"default:true" json:"isConnected"`
	// Figures the provider itself publishes, counted per problem rather than per
	// submission. Refreshed on sync so the dashboard never has to call out.
	TotalScore     int64      `gorm:"default:0" json:"totalScore"`
	ProblemsTried  int        `gorm:"default:0" json:"problemsTried"`
	ProblemsSolved int        `gorm:"default:0" json:"problemsSolved"`
	StatsSyncedAt  *time.Time `json:"statsSyncedAt,omitempty"`
	LinkedAt       time.Time  `json:"linkedAt"`
	CreatedAt      time.Time  `json:"createdAt"`
	UpdatedAt      time.Time  `json:"updatedAt"`

	User User `gorm:"foreignKey:UserID" json:"-"`
}
