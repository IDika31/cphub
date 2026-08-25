package config

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/joho/godotenv"
	"github.com/spf13/viper"
)

type Config struct {
	DB     DBConfig
	Redis  RedisConfig
	Server ServerConfig
	JWT    JWTConfig
	Google OAuthConfig
	CF     OAuthConfig
	// Codeforces API key/secret from codeforces.com/settings/api. Optional and
	// unrelated to the OAuth pair above: it only widens anonymous API reads to
	// data private to that account.
	CFAPIKey    string
	CFAPISecret string
	// CredEncKey is the 32-byte AES-GCM key that protects a stored Codeforces
	// password. Empty means no password is ever written to the database, and an
	// expired session has to be re-entered by hand.
	CredEncKey string
	Grader     GraderConfig
	Log        LogConfig
}

type DBConfig struct {
	Host     string
	Port     int
	User     string
	Password string
	Name     string
	SSLMode  string
	Timezone string
}

func (c DBConfig) DSN() string {
	return fmt.Sprintf(
		"host=%s port=%d user=%s password=%s dbname=%s sslmode=%s TimeZone=%s",
		c.Host, c.Port, c.User, c.Password, c.Name, c.SSLMode, c.Timezone,
	)
}

type RedisConfig struct {
	Host     string
	Port     int
	Password string
	DB       int
}

func (c RedisConfig) Addr() string {
	return fmt.Sprintf("%s:%d", c.Host, c.Port)
}

type ServerConfig struct {
	Port    string
	Host    string
	BaseURL string
	// WebBaseURL is where OAuth callbacks send the browser back to, and
	// CORSOrigins is the allowlist the API answers with. Both are per-deployment:
	// hardcoding localhost broke every non-local install.
	WebBaseURL  string
	CORSOrigins string
}

type JWTConfig struct {
	Secret        string
	AccessExpiry  time.Duration
	RefreshExpiry time.Duration
}

type OAuthConfig struct {
	ClientID     string
	ClientSecret string
	RedirectURL  string
}

type GraderConfig struct {
	MaxConcurrent     int
	TimeoutSeconds    int
	MemoryLimitMB     int
	MaxOutputKB       int
	TimeGraceMS       int
	SandboxOverheadMS int
	MaxTimeLimitMS    int
	MaxCodeSizeKB     int
	TempDir           string
	FirejailProfile   string
	CompilerPaths     CompilerPaths
}

type CompilerPaths struct {
	GCC      string
	Python3  string
	Node     string
	Javac    string
	Java     string
	Firejail string
}

type LogConfig struct {
	Level  string
	Format string
}

func Load() *Config {
	// Load .env from repo root using godotenv
	envPaths := []string{".env", "../../.env", "../.env"}
	loaded := false
	for _, p := range envPaths {
		if _, err := os.Stat(p); err == nil {
			if err := godotenv.Load(p); err == nil {
				log.Printf("[config] loaded .env from %s", filepath.Clean(p))
				loaded = true
				break
			}
		}
	}
	if !loaded {
		log.Println("[config] WARNING: no .env file found")
	}

	viper.AutomaticEnv()

	cfg := &Config{
		DB: DBConfig{
			Host:     getEnv("DB_HOST", "localhost"),
			Port:     getEnvInt("DB_PORT", 5432),
			User:     getEnv("DB_USER", "cphub"),
			Password: getEnv("DB_PASSWORD", "cphub"),
			Name:     getEnv("DB_NAME", "cphub"),
			SSLMode:  getEnv("DB_SSLMODE", "disable"),
			Timezone: getEnv("DB_TIMEZONE", "Asia/Jakarta"),
		},
		Redis: RedisConfig{
			Host:     getEnv("REDIS_HOST", "localhost"),
			Port:     getEnvInt("REDIS_PORT", 6379),
			Password: getEnv("REDIS_PASSWORD", ""),
			DB:       getEnvInt("REDIS_DB", 0),
		},
		Server: ServerConfig{
			Port:        getEnv("API_PORT", "3001"),
			Host:        getEnv("API_HOST", "0.0.0.0"),
			BaseURL:     getEnv("API_BASE_URL", "http://localhost:3001"),
			WebBaseURL:  getEnv("WEB_BASE_URL", "http://localhost:3000"),
			CORSOrigins: getEnv("CORS_ORIGINS", "http://localhost:3000"),
		},
		JWT: JWTConfig{
			Secret:        getEnv("JWT_SECRET", "change-me"),
			AccessExpiry:  getEnvDuration("JWT_ACCESS_EXPIRY", 15*time.Minute),
			RefreshExpiry: getEnvDuration("JWT_REFRESH_EXPIRY", 7*24*time.Hour),
		},
		Google: OAuthConfig{
			ClientID:     getEnv("GOOGLE_CLIENT_ID", ""),
			ClientSecret: getEnv("GOOGLE_CLIENT_SECRET", ""),
			RedirectURL:  getEnv("GOOGLE_REDIRECT_URL", ""),
		},
		CF: OAuthConfig{
			ClientID:     getEnv("CF_CLIENT_ID", ""),
			ClientSecret: getEnv("CF_CLIENT_SECRET", ""),
			RedirectURL:  getEnv("CF_REDIRECT_URL", ""),
		},
		CFAPIKey:    getEnv("CF_API_KEY", ""),
		CFAPISecret: getEnv("CF_API_SECRET", ""),
		CredEncKey:  getEnv("CRED_ENC_KEY", ""),
		Grader: GraderConfig{
			MaxConcurrent:     getEnvInt("GRADER_MAX_CONCURRENT", 5),
			TimeoutSeconds:    getEnvInt("GRADER_TIMEOUT_SECONDS", 5),
			MemoryLimitMB:     getEnvInt("GRADER_MEMORY_LIMIT_MB", 512),
			MaxOutputKB:       getEnvInt("GRADER_MAX_OUTPUT_KB", 256),
			TimeGraceMS:       getEnvInt("GRADER_TIME_GRACE_MS", 500),
			SandboxOverheadMS: getEnvInt("GRADER_SANDBOX_OVERHEAD_MS", 0),
			MaxTimeLimitMS:    getEnvInt("GRADER_MAX_TIME_LIMIT_MS", 15000),
			MaxCodeSizeKB:     getEnvInt("GRADER_MAX_CODE_SIZE_KB", 256),
			TempDir:           getEnv("GRADER_TEMP_DIR", defaultTempDir()),
			FirejailProfile:   sanitizeFirejailProfile(getEnv("GRADER_FIREJAIL_PROFILE", "")),
			CompilerPaths:     defaultCompilerPaths(),
		},
		Log: LogConfig{
			Level:  getEnv("LOG_LEVEL", "debug"),
			Format: getEnv("LOG_FORMAT", "text"),
		},
	}

	log.Printf("[config] loaded config (env=%s)", getEnv("ENVIRONMENT", "development"))
	return cfg
}

func getEnv(key, defaultVal string) string {
	viper.SetDefault(key, defaultVal)
	return viper.GetString(key)
}

func getEnvInt(key string, defaultVal int) int {
	viper.SetDefault(key, defaultVal)
	return viper.GetInt(key)
}

func getEnvDuration(key string, defaultVal time.Duration) time.Duration {
	viper.SetDefault(key, defaultVal)
	val := viper.GetString(key)
	d, err := time.ParseDuration(val)
	if err != nil {
		return defaultVal
	}
	return d
}

func defaultTempDir() string {
	return filepath.Join(os.TempDir(), "cphub-grader")
}

// sanitizeFirejailProfile drops a profile that carries a `timeout` directive.
// firejail holds the sandbox open for that whole duration even after the payload
// exits, so such a profile turns every run into a TLE. The grader passes its
// hardening flags explicitly, so no profile is needed at all.
func sanitizeFirejailProfile(path string) string {
	if path == "" || runtime.GOOS == "windows" {
		return ""
	}
	body, err := os.ReadFile(path)
	if err != nil {
		log.Printf("[config] firejail profile %s unreadable (%v) — using built-in hardening", path, err)
		return ""
	}
	for _, line := range strings.Split(string(body), "\n") {
		if strings.HasPrefix(strings.TrimSpace(line), "timeout") {
			log.Printf("[config] IGNORING firejail profile %s: it sets `timeout`, which makes every run report TLE", path)
			return ""
		}
	}
	return path
}

func defaultCompilerPaths() CompilerPaths {
	if runtime.GOOS == "windows" {
		return CompilerPaths{
			GCC:      getEnv("GCC_PATH", "g++"),
			Python3:  getEnv("PYTHON3_PATH", "python"),
			Node:     getEnv("NODE_PATH", "node"),
			Javac:    getEnv("JAVAC_PATH", "javac"),
			Java:     getEnv("JAVA_PATH", "java"),
			Firejail: "",
		}
	}
	return CompilerPaths{
		GCC:      getEnv("GCC_PATH", "/usr/bin/g++"),
		Python3:  getEnv("PYTHON3_PATH", "/usr/bin/python3"),
		Node:     getEnv("NODE_PATH", "/usr/bin/node"),
		Javac:    getEnv("JAVAC_PATH", "/usr/bin/javac"),
		Java:     getEnv("JAVA_PATH", "/usr/bin/java"),
		Firejail: getEnv("FIREJAIL_PATH", "/usr/bin/firejail"),
	}
}
