package service

import (
	"errors"
	"fmt"
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

func (s *AuthService) Register(input RegisterInput) (*AuthResponse, error) {
	// Check existing
	var existing model.User
	if err := s.db.Where("email = ?", input.Email).First(&existing).Error; err == nil {
		return nil, errors.New("email already registered")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("failed to hash password: %w", err)
	}

	user := model.User{
		ID:           uuid.New(),
		Email:        input.Email,
		PasswordHash: string(hash),
		Name:         input.Name,
		AuthProvider: "email",
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
	var user model.User
	if err := s.db.Where("email = ?", input.Email).First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("invalid email or password")
		}
		return nil, fmt.Errorf("database error: %w", err)
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(input.Password)); err != nil {
		return nil, errors.New("invalid email or password")
	}

	access, refresh, err := middleware.GenerateTokenPair(user.ID.String(), user.Email, s.cfg)
	if err != nil {
		return nil, fmt.Errorf("failed to generate tokens: %w", err)
	}

	now := time.Now()
	user.LastLoginAt = &now
	s.db.Save(&user)

	return &AuthResponse{User: user, AccessToken: access, RefreshToken: refresh}, nil
}

func (s *AuthService) GoogleAuth(googleID, email, name, avatarURL string) (*AuthResponse, error) {
	var user model.User
	err := s.db.Where("google_id = ?", googleID).Or("email = ? AND auth_provider = 'google'", email).First(&user).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		user = model.User{
			ID:           uuid.New(),
			Email:        email,
			Name:         name,
			AvatarURL:    avatarURL,
			AuthProvider: "google",
			GoogleID:     googleID,
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
