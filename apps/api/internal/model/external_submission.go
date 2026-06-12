package model

import (
	"time"

	"github.com/google/uuid"
)

type ExternalSubmission struct {
	ID             uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	UserID         uuid.UUID `gorm:"type:uuid;not null;index" json:"userId"`
	ProblemID      uuid.UUID `gorm:"type:uuid;index" json:"problemId"`
	Provider       string    `gorm:"not null;size:20" json:"provider"`
	SubmissionID   string    `gorm:"size:50;uniqueIndex:idx_provider_submission" json:"submissionId"`
	ProblemTitle   string    `gorm:"size:300" json:"problemTitle"`
	ProblemRef     string    `gorm:"size:50" json:"problemRef"`
	Language       string    `gorm:"size:30" json:"language"`
	Verdict        string    `gorm:"size:30" json:"verdict"`
	Runtime        int       `gorm:"default:0" json:"runtime"`
	Memory         int       `gorm:"default:0" json:"memory"`
	SubmittedAt    *time.Time `json:"submittedAt,omitempty"`
	CreatedAt      time.Time  `json:"createdAt"`

	User    User    `gorm:"foreignKey:UserID" json:"-"`
	Problem Problem `gorm:"foreignKey:ProblemID" json:"-"`
}

func (ExternalSubmission) TableName() string { return "external_submissions" }
