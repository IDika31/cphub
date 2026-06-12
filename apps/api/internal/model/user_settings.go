package model

import (
	"time"

	"github.com/google/uuid"
)

type UserSettings struct {
	ID              uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	UserID          uuid.UUID `gorm:"type:uuid;uniqueIndex;not null" json:"userId"`
	DefaultLanguage string    `gorm:"default:'cpp17';size:20" json:"defaultLanguage"`
	DefaultTheme    string    `gorm:"default:'dark';size:10" json:"defaultTheme"`
	AutoSync        bool      `gorm:"default:true" json:"autoSync"`
	EditorFontSize  int       `gorm:"default:14" json:"editorFontSize"`
	TabSize         int       `gorm:"default:4" json:"tabSize"`
	Templates       string    `gorm:"type:jsonb;default:'{}'" json:"templates"` // lang -> template JSON
	CreatedAt       time.Time  `json:"createdAt"`
	UpdatedAt       time.Time  `json:"updatedAt"`

	User User `gorm:"foreignKey:UserID" json:"-"`
}

func (UserSettings) TableName() string { return "user_settings" }
