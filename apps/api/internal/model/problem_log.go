package model

import (
	"time"

	"github.com/google/uuid"
)

type ProblemLog struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	UserID    uuid.UUID `gorm:"type:uuid;not null;index" json:"userId"`
	ProblemID uuid.UUID `gorm:"type:uuid;not null;index" json:"problemId"`
	Action    string    `gorm:"not null;size:20" json:"action"` // opened, solved, attempted
	Timestamp time.Time  `json:"timestamp"`
	CreatedAt time.Time  `json:"createdAt"`

	User    User    `gorm:"foreignKey:UserID" json:"-"`
	Problem Problem `gorm:"foreignKey:ProblemID" json:"-"`
}

func (ProblemLog) TableName() string { return "problem_logs" }
