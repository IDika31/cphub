package model

import (
	"time"

	"github.com/google/uuid"
)

// ProblemNote is what one user wrote down about one problem.
//
// Per user, unlike everything else hanging off a problem: the library is shared and has
// no owner, so "I forgot the overflow" belongs to the person who wrote it, not to the
// problem. Keyed on the problem's primary key so the note survives a resync of the
// provider's own row.
type ProblemNote struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	UserID    uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:uq_problem_note_user_problem,priority:1" json:"userId"`
	ProblemID uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:uq_problem_note_user_problem,priority:2" json:"problemId"`
	Body      string    `gorm:"type:text;not null;default:''" json:"body"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func (ProblemNote) TableName() string { return "problem_notes" }
