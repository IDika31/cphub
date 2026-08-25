package model

import (
	"time"

	"github.com/google/uuid"
)

type ExternalSubmission struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	UserID uuid.UUID `gorm:"type:uuid;not null;index:idx_user_provider_submission,unique,priority:1" json:"userId"`
	// ProblemID is optional: a submission can arrive before its problem is in the
	// library. `default:null` makes GORM omit the zero UUID on insert so the row
	// gets a real NULL instead of 00000000-…, which violates the foreign key.
	ProblemID    uuid.UUID `gorm:"type:uuid;index;default:null" json:"problemId"`
	Provider     string    `gorm:"not null;size:20;index:idx_user_provider_submission,unique,priority:2" json:"provider"`
	SubmissionID string    `gorm:"size:50;index:idx_user_provider_submission,unique,priority:3" json:"submissionId"`
	ProblemTitle string    `gorm:"size:300" json:"problemTitle"`
	ProblemRef   string    `gorm:"size:100" json:"problemRef"`
	// ProblemGroup is the contest/container a submission belongs to (TLX
	// containers, CF contest names) — useful for grouping in the UI.
	ProblemGroup string `gorm:"size:200" json:"problemGroup,omitempty"`
	Language     string `gorm:"size:30" json:"language"`
	Verdict      string `gorm:"size:30" json:"verdict"`
	// Score carries subtask-scored results (TLX 0..100). Verdict alone cannot tell
	// a 70/100 from a 0.
	Score       int        `gorm:"default:0" json:"score"`
	Runtime     int        `gorm:"default:0" json:"runtime"`
	Memory      int        `gorm:"default:0" json:"memory"`
	SubmittedAt *time.Time `json:"submittedAt,omitempty"`
	CreatedAt   time.Time  `json:"createdAt"`

	User User `gorm:"foreignKey:UserID" json:"-"`
	// See LocalSubmission.Problem: without references:ID this resolves against
	// Problem.ProblemID instead of the primary key and silently preloads nothing.
	Problem Problem `gorm:"foreignKey:ProblemID;references:ID" json:"-"`
}

func (ExternalSubmission) TableName() string { return "external_submissions" }
