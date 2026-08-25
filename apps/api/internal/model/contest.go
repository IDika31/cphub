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
	SyncedAt        *time.Time `json:"syncedAt,omitempty"`
	CreatedAt       time.Time  `json:"createdAt"`
	UpdatedAt       time.Time  `json:"updatedAt"`
}

func (Contest) TableName() string { return "contests" }
