package config

import (
	"fmt"
	"log"
	"time"

	"github.com/spf13/viper"
)

type Config struct {
	DB        DBConfig
	Redis     RedisConfig
	Server    ServerConfig
	JWT       JWTConfig
	Google    OAuthConfig
	CF        OAuthConfig
	Extension ExtensionConfig
	Grader    GraderConfig
	Log       LogConfig
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

type ExtensionConfig struct {
	HMACSecret string
}

type GraderConfig struct {
	MaxConcurrent    int
	TimeoutSeconds   int
	MemoryLimitMB    int
	MaxOutputKB      int
	MaxCodeSizeKB    int
	TempDir          string
	FirejailProfile  string
	CompilerPaths    CompilerPaths
}

type CompilerPaths struct {
	GCC     string
	Python3 string
	Node    string
	Javac   string
	Java    string
	Firejail string
}

type LogConfig struct {
	Level  string
	Format string
}

func Load() *Config {
	// Look for .env in project root (two levels up from apps/api/)
	viper.SetConfigFile(".env")
	viper.AddConfigPath(".")
	viper.AddConfigPath("..")
	viper.AddConfigPath("../..") // repo root from apps/api/
	viper.AutomaticEnv()

	_ = viper.ReadInConfig()

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
			Port:    getEnv("API_PORT", "3001"),
			Host:    getEnv("API_HOST", "0.0.0.0"),
			BaseURL: getEnv("API_BASE_URL", "http://localhost:3001"),
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
		Extension: ExtensionConfig{
			HMACSecret: getEnv("EXTENSION_HMAC_SECRET", "change-me"),
		},
		Grader: GraderConfig{
			MaxConcurrent:   getEnvInt("GRADER_MAX_CONCURRENT", 5),
			TimeoutSeconds:  getEnvInt("GRADER_TIMEOUT_SECONDS", 5),
			MemoryLimitMB:   getEnvInt("GRADER_MEMORY_LIMIT_MB", 512),
			MaxOutputKB:     getEnvInt("GRADER_MAX_OUTPUT_KB", 10),
			MaxCodeSizeKB:   getEnvInt("GRADER_MAX_CODE_SIZE_KB", 256),
			TempDir:         getEnv("GRADER_TEMP_DIR", "/tmp/cphub-grader"),
			FirejailProfile: getEnv("GRADER_FIREJAIL_PROFILE", "/etc/firejail/cphub.local"),
			CompilerPaths: CompilerPaths{
				GCC:      getEnv("GCC_PATH", "/usr/bin/g++"),
				Python3:  getEnv("PYTHON3_PATH", "/usr/bin/python3"),
				Node:     getEnv("NODE_PATH", "/usr/bin/node"),
				Javac:    getEnv("JAVAC_PATH", "/usr/bin/javac"),
				Java:     getEnv("JAVA_PATH", "/usr/bin/java"),
				Firejail: getEnv("FIREJAIL_PATH", "/usr/bin/firejail"),
			},
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
