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
	// Materials is what the provider links beside the problem — the editorial, mostly —
	// as a JSON array of {title, url}. It arrives with the statement upload rather than
	// from a fetch of its own: Codeforces prints these links on the problem page, so the
	// page CPHub already has carries them. Text for the same reason Tags is.
	Materials string `gorm:"type:text;default:'[]'" json:"materials"`
	URL         string    `gorm:"size:500" json:"url"`
	Status      string    `gorm:"default:'unsolved';size:20" json:"status"` // unsolved, solved, attempted
	SyncedAt    time.Time  `json:"syncedAt"`
	CreatedAt   time.Time  `json:"createdAt"`
	UpdatedAt   time.Time  `json:"updatedAt"`

	TestCases []TestCase `gorm:"foreignKey:ProblemID" json:"testCases,omitempty"`
}

func (Problem) TableName() string { return "problems" }
