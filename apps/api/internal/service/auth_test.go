package service

import (
	"testing"
	"time"

	"github.com/IDika31/cphub/api/internal/config"
	"github.com/google/uuid"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

type testUser struct {
	ID           uuid.UUID `gorm:"type:text;primaryKey"`
	Email        string    `gorm:"uniqueIndex;not null"`
	PasswordHash string
	Name         string
	AvatarURL    string
	AuthProvider string `gorm:"not null;default:email"`
	GoogleID     string
}

func setupTestSvc(t *testing.T) *AuthService {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		t.Fatalf("failed to open test db: %v", err)
	}

	// Auto-migrate — note: SQLite gen_random_uuid() won't work
	// but GORM is lenient about defaults in SQLite
	db.Exec(`CREATE TABLE IF NOT EXISTS users (
		id TEXT PRIMARY KEY,
		email TEXT UNIQUE NOT NULL,
		password_hash TEXT,
		name TEXT NOT NULL,
		avatar_url TEXT,
		auth_provider TEXT NOT NULL DEFAULT 'email',
		google_id TEXT,
		is_onboarded NUMERIC DEFAULT 0,
		last_login_at DATETIME,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	)`)

	cfg := config.JWTConfig{
		Secret:        "test-secret-for-unit-tests",
		AccessExpiry:  15 * time.Minute,
		RefreshExpiry: 7 * 24 * time.Hour,
	}

	return NewAuthService(db, cfg)
}

func TestRegister_Success(t *testing.T) {
	svc := setupTestSvc(t)

	resp, err := svc.Register(RegisterInput{
		Name:     "Test User",
		Email:    "test@example.com",
		Password: "password123",
	})

	if err != nil {
		t.Fatalf("register failed: %v", err)
	}
	if resp == nil {
		t.Fatal("response should not be nil")
	}
	if resp.User.Email != "test@example.com" {
		t.Errorf("email mismatch: got %s", resp.User.Email)
	}
	if resp.AccessToken == "" {
		t.Error("access token should not be empty")
	}
}

func TestRegister_DuplicateEmail(t *testing.T) {
	svc := setupTestSvc(t)

	svc.Register(RegisterInput{Name: "One", Email: "same@example.com", Password: "pass12345"})
	_, err := svc.Register(RegisterInput{Name: "Two", Email: "same@example.com", Password: "diff67890"})

	if err == nil {
		t.Error("duplicate email should fail")
	}
}

func TestLogin_Success(t *testing.T) {
	svc := setupTestSvc(t)

	svc.Register(RegisterInput{Name: "Login", Email: "login@example.com", Password: "password123"})

	resp, err := svc.Login(LoginInput{Email: "login@example.com", Password: "password123"})
	if err != nil {
		t.Fatalf("login failed: %v", err)
	}
	if resp.AccessToken == "" {
		t.Error("access token should not be empty")
	}
}

func TestLogin_WrongPassword(t *testing.T) {
	svc := setupTestSvc(t)

	svc.Register(RegisterInput{Name: "U", Email: "u@example.com", Password: "correct"})

	_, err := svc.Login(LoginInput{Email: "u@example.com", Password: "wrong"})
	if err == nil {
		t.Error("wrong password should fail")
	}
}

func TestLogin_NonexistentUser(t *testing.T) {
	svc := setupTestSvc(t)

	_, err := svc.Login(LoginInput{Email: "nobody@example.com", Password: "pass"})
	if err == nil {
		t.Error("nonexistent user should fail")
	}
}

func TestGoogleAuth_NewUser(t *testing.T) {
	svc := setupTestSvc(t)

	resp, err := svc.GoogleAuth("g1", "guser@example.com", "G User", "")
	if err != nil {
		t.Fatalf("google auth failed: %v", err)
	}
	if resp.User.AuthProvider != "google" {
		t.Errorf("auth provider should be google, got %s", resp.User.AuthProvider)
	}
}

func TestGoogleAuth_ExistingUser(t *testing.T) {
	svc := setupTestSvc(t)

	svc.GoogleAuth("g1", "guser@example.com", "G User", "")
	resp, err := svc.GoogleAuth("g1", "guser@example.com", "G User", "")

	if err != nil {
		t.Fatalf("returning google auth failed: %v", err)
	}
	if resp.User.Email != "guser@example.com" {
		t.Errorf("email mismatch: got %s", resp.User.Email)
	}
}
