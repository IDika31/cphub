package model

import (
	"time"

	"github.com/google/uuid"
)

// Contest is a provider's contest, kept separately from Problem because it has a
// lifecycle of its own: a phase that moves BEFORE → CODING → FINISHED, a start
// time worth counting down to, and registration as an action against the contest
// itself. ContestRef is the provider's own id, as text.
type Contest struct {
	ID              uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	Provider        string     `gorm:"not null;size:20;uniqueIndex:uq_contests_provider_ref,priority:1" json:"provider"`
	ContestRef      string     `gorm:"not null;size:50;uniqueIndex:uq_contests_provider_ref,priority:2" json:"contestRef"`
	Name            string     `gorm:"not null;size:300" json:"name"`
	Type            string     `gorm:"size:20" json:"type"`
	Phase           string     `gorm:"size:30" json:"phase"`
	Frozen          bool       `gorm:"default:false" json:"frozen"`
	StartTime       *time.Time `json:"startTime,omitempty"`
	DurationSeconds int64      `gorm:"default:0" json:"durationSeconds"`
	URL             string     `gorm:"size:500" json:"url"`
	// RegistrationOpensAt is when Codeforces starts accepting entries. NULL means
	// unknown — see migrations/000012 for why it is an instant and not a flag.
	RegistrationOpensAt *time.Time `json:"registrationOpensAt,omitempty"`
	SyncedAt            *time.Time `json:"syncedAt,omitempty"`
	CreatedAt           time.Time  `json:"createdAt"`
	UpdatedAt           time.Time  `json:"updatedAt"`

	// Registered is per-viewer, not per-contest, so it is a view field rather than a
	// column: `gorm:"-"` keeps it out of every read and write of this table, including
	// the upsert the contest sync performs.
	Registered bool `gorm:"-" json:"registered"`
}

func (Contest) TableName() string { return "contests" }

// ContestRegistration records that an account is signed up for a contest.
//
// It exists because Codeforces publishes registration state nowhere readable: its API
// refuses contest.standings for a contest that has not started — which is precisely
// when registration is open — and has no registrants method. See
// migrations/000011_contest_registrations.up.sql for the measurement.
type ContestRegistration struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	UserID       uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:uq_contest_reg_user_contest,priority:1" json:"userId"`
	Provider     string    `gorm:"not null;size:20;uniqueIndex:uq_contest_reg_user_contest,priority:2" json:"provider"`
	ContestRef   string    `gorm:"not null;size:50;uniqueIndex:uq_contest_reg_user_contest,priority:3" json:"contestRef"`
	RegisteredAt time.Time `json:"registeredAt"`
}

func (ContestRegistration) TableName() string { return "contest_registrations" }
