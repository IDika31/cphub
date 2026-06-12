package model

import (
	"time"

	"github.com/google/uuid"
)

type TestCase struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	ProblemID uuid.UUID `gorm:"type:uuid;not null;index" json:"problemId"`
	Input     string    `gorm:"type:text;not null" json:"input"`
	Output    string    `gorm:"type:text;not null" json:"output"`
	IsSample  bool      `gorm:"default:true" json:"isSample"`
	IsCustom  bool      `gorm:"default:false" json:"isCustom"`
	Order     int       `gorm:"default:0" json:"order"`
	CreatedAt time.Time  `json:"createdAt"`

	Problem Problem `gorm:"foreignKey:ProblemID" json:"-"`
}

func (TestCase) TableName() string { return "test_cases" }
