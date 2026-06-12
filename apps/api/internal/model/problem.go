package model

import (
	"time"

	"github.com/google/uuid"
)

type Problem struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	Provider    string    `gorm:"not null;size:20;index" json:"provider"` // codeforces, tlx
	ProblemID   string    `gorm:"not null;size:50;uniqueIndex:idx_provider_problem" json:"problemId"`
	Title       string    `gorm:"not null;size:300" json:"title"`
	Statement   string    `gorm:"type:text" json:"statement"`
	InputSpec   string    `gorm:"type:text" json:"inputSpec"`
	OutputSpec  string    `gorm:"type:text" json:"outputSpec"`
	Note        string    `gorm:"type:text" json:"note"`
 ProblemGroup string `gorm:"size:200" json:"problemGroup"`
	Difficulty  int       `gorm:"default:0" json:"difficulty"`
	TimeLimit   string    `gorm:"size:20" json:"timeLimit"`
	MemoryLimit string    `gorm:"size:20" json:"memoryLimit"`
	Tags        string    `gorm:"type:text" json:"tags"` // JSON array
	URL         string    `gorm:"size:500" json:"url"`
	Status      string    `gorm:"default:'unsolved';size:20" json:"status"` // unsolved, solved, attempted
	SyncedAt    time.Time  `json:"syncedAt"`
	CreatedAt   time.Time  `json:"createdAt"`
	UpdatedAt   time.Time  `json:"updatedAt"`

	TestCases []TestCase `gorm:"foreignKey:ProblemID" json:"testCases,omitempty"`
}

func (Problem) TableName() string { return "problems" }
