package model

import (
	"time"

	"github.com/google/uuid"
)

type LocalSubmission struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	UserID       uuid.UUID `gorm:"type:uuid;not null;index" json:"userId"`
	ProblemID    uuid.UUID `gorm:"type:uuid;not null;index" json:"problemId"`
	Language     string    `gorm:"not null;size:20" json:"language"`
	SourceCode   string    `gorm:"type:text;not null" json:"sourceCode"`
	Verdict      string    `gorm:"size:20" json:"verdict"` // AC, WA, TLE, RE, CE, PENDING
	Runtime      int       `gorm:"default:0" json:"runtime"`   // ms
	Memory       int       `gorm:"default:0" json:"memory"`    // KB
	PassedTests  int       `gorm:"default:0" json:"passedTests"`
	TotalTests   int       `gorm:"default:0" json:"totalTests"`
	ErrorMessage string    `gorm:"type:text" json:"errorMessage,omitempty"`
	ExecutedAt   time.Time  `json:"executedAt"`
	CreatedAt    time.Time  `json:"createdAt"`

	User    User    `gorm:"foreignKey:UserID" json:"-"`
	Problem Problem `gorm:"foreignKey:ProblemID" json:"-"`
}

func (LocalSubmission) TableName() string { return "local_submissions" }
