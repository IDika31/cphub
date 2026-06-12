package model

import (
	"time"

	"github.com/google/uuid"
)

type Snippet struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	UserID      uuid.UUID `gorm:"type:uuid;not null;index" json:"userId"`
	Title       string    `gorm:"not null;size:200" json:"title"`
	Language    string    `gorm:"not null;size:20" json:"language"`
	Code        string    `gorm:"type:text;not null" json:"code"`
	Tags        string    `gorm:"type:text" json:"tags"` // JSON array
	Description string    `gorm:"type:text" json:"description"`
	Version     int       `gorm:"default:1" json:"version"`
	CreatedAt   time.Time  `json:"createdAt"`
	UpdatedAt   time.Time  `json:"updatedAt"`

	User User `gorm:"foreignKey:UserID" json:"-"`
}

func (Snippet) TableName() string { return "snippets" }
