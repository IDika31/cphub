package service

import (
	"strings"
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
		extension_secret TEXT,
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

	// 8+ chars, otherwise Register rejects it and this stops testing the
	// wrong-password path at all.
	if _, err := svc.Register(RegisterInput{Name: "U", Email: "u@example.com", Password: "correct1"}); err != nil {
		t.Fatalf("setup register failed: %v", err)
	}

	_, err := svc.Login(LoginInput{Email: "u@example.com", Password: "wrong123"})
	if err == nil {
		t.Error("wrong password should fail")
	}
}

// Addresses are case-insensitive in practice. Matching the column exactly meant
// an account registered with any capital letter could not be signed into with
// the lowercase spelling people actually type.
func TestLogin_EmailIsCaseAndSpaceInsensitive(t *testing.T) {
	svc := setupTestSvc(t)

	if _, err := svc.Register(RegisterInput{
		Name: "Mixed", Email: "  Me@Example.COM ", Password: "password123",
	}); err != nil {
		t.Fatalf("register failed: %v", err)
	}

	for _, attempt := range []string{"me@example.com", "ME@EXAMPLE.COM", " me@example.com  "} {
		if _, err := svc.Login(LoginInput{Email: attempt, Password: "password123"}); err != nil {
			t.Errorf("login with %q failed: %v", attempt, err)
		}
	}
}

func TestRegister_DuplicateIgnoresCase(t *testing.T) {
	svc := setupTestSvc(t)

	if _, err := svc.Register(RegisterInput{Name: "One", Email: "dup@example.com", Password: "password123"}); err != nil {
		t.Fatalf("first register failed: %v", err)
	}
	if _, err := svc.Register(RegisterInput{Name: "Two", Email: "DUP@Example.com", Password: "password456"}); err == nil {
		t.Error("a differently-cased duplicate must be rejected, not shadow the original")
	}
}

func TestRegister_RejectsShortPassword(t *testing.T) {
	svc := setupTestSvc(t)
	if _, err := svc.Register(RegisterInput{Name: "S", Email: "s@example.com", Password: "short"}); err == nil {
		t.Error("a 5-character password should be rejected at the service layer too")
	}
}

// A Google account has no password hash. Reporting "invalid email or password"
// sends the user off to reset a password that never existed.
func TestLogin_GoogleAccountSaysSo(t *testing.T) {
	svc := setupTestSvc(t)

	if _, err := svc.GoogleAuth("g-only", "goog@example.com", "G", ""); err != nil {
		t.Fatalf("google auth setup failed: %v", err)
	}

	_, err := svc.Login(LoginInput{Email: "goog@example.com", Password: "anything123"})
	if err == nil {
		t.Fatal("password login on a Google account must fail")
	}
	if !strings.Contains(err.Error(), "Google") {
		t.Errorf("error should point at Google sign-in, got: %v", err)
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
