package service

import (
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/IDika31/cphub/api/internal/config"
	"github.com/IDika31/cphub/api/internal/middleware"
	"github.com/IDika31/cphub/api/internal/model"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type AuthService struct {
	db  *gorm.DB
	cfg config.JWTConfig
}

func NewAuthService(db *gorm.DB, cfg config.JWTConfig) *AuthService {
	return &AuthService{db: db, cfg: cfg}
}

type RegisterInput struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

type LoginInput struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type AuthResponse struct {
	User         model.User `json:"user"`
	AccessToken  string     `json:"accessToken"`
	RefreshToken string     `json:"refreshToken"`
}

// normalizeEmail makes lookups forgiving in the two ways that actually bite:
// stray whitespace from a mobile keyboard, and capitalisation. Addresses are
// case-insensitive in practice, but the login query matched the column exactly —
// so an account registered as "Me@Gmail.com" could not be signed into as
// "me@gmail.com".
func normalizeEmail(raw string) string {
	return strings.ToLower(strings.TrimSpace(raw))
}

func (s *AuthService) findByEmail(email string) (*model.User, error) {
	var user model.User
	err := s.db.Where("LOWER(email) = ?", normalizeEmail(email)).First(&user).Error
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (s *AuthService) Register(input RegisterInput) (*AuthResponse, error) {
	email := normalizeEmail(input.Email)
	if email == "" {
		return nil, errors.New("email is required")
	}
	if len(input.Password) < 8 {
		return nil, errors.New("password must be at least 8 characters")
	}

	// Case-insensitive check, so "Me@x.com" cannot shadow an existing "me@x.com".
	if _, err := s.findByEmail(email); err == nil {
		return nil, errors.New("email already registered")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("failed to hash password: %w", err)
	}

	user := model.User{
		ID:              uuid.New(),
		Email:           email,
		PasswordHash:    string(hash),
		Name:            strings.TrimSpace(input.Name),
		AuthProvider:    "email",
		ExtensionSecret: model.NewExtensionSecret(),
	}

	if err := s.db.Create(&user).Error; err != nil {
		return nil, fmt.Errorf("failed to create user: %w", err)
	}

	access, refresh, err := middleware.GenerateTokenPair(user.ID.String(), user.Email, s.cfg)
	if err != nil {
		return nil, fmt.Errorf("failed to generate tokens: %w", err)
	}

	return &AuthResponse{User: user, AccessToken: access, RefreshToken: refresh}, nil
}

func (s *AuthService) Login(input LoginInput) (*AuthResponse, error) {
	user, err := s.findByEmail(input.Email)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("invalid email or password")
		}
		return nil, fmt.Errorf("database error: %w", err)
	}

	// An account created through Google has no password. Saying "invalid email or
	// password" there sends people off to reset a password that never existed.
	if user.PasswordHash == "" {
		return nil, errors.New("this account signs in with Google — use Continue with Google")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(input.Password)); err != nil {
		return nil, errors.New("invalid email or password")
	}

	access, refresh, err := middleware.GenerateTokenPair(user.ID.String(), user.Email, s.cfg)
	if err != nil {
		return nil, fmt.Errorf("failed to generate tokens: %w", err)
	}

	// Touch only the one column: a full Save() rewrites every field from a struct
	// that may already be stale.
	now := time.Now()
	if err := s.db.Model(user).Update("last_login_at", now).Error; err != nil {
		log.Printf("[auth] could not record last_login_at for %s: %v", user.ID, err)
	}
	user.LastLoginAt = &now

	return &AuthResponse{User: *user, AccessToken: access, RefreshToken: refresh}, nil
}

func (s *AuthService) GoogleAuth(googleID, email, name, avatarURL string) (*AuthResponse, error) {
	var user model.User
	err := s.db.Where("google_id = ?", googleID).Or("LOWER(email) = ? AND auth_provider = 'google'", normalizeEmail(email)).First(&user).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		user = model.User{
			ID:              uuid.New(),
			Email:           email,
			Name:            name,
			AvatarURL:       avatarURL,
			AuthProvider:    "google",
			GoogleID:        googleID,
			ExtensionSecret: model.NewExtensionSecret(),
		}
		if err := s.db.Create(&user).Error; err != nil {
			return nil, fmt.Errorf("failed to create user: %w", err)
		}
	} else if err != nil {
		return nil, fmt.Errorf("database error: %w", err)
	}

	access, refresh, err := middleware.GenerateTokenPair(user.ID.String(), user.Email, s.cfg)
	if err != nil {
		return nil, fmt.Errorf("failed to generate tokens: %w", err)
	}

	return &AuthResponse{User: user, AccessToken: access, RefreshToken: refresh}, nil
}
