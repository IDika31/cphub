package main

import (
	"fmt"
	"log"
	"os"

	"github.com/IDika31/cphub/api/internal/config"
	"github.com/IDika31/cphub/api/internal/database"
	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
)

func main() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	log.Println("[migrate] running database migrations...")

	cfg := config.Load()

	db, err := database.Connect(cfg.DB)
	if err != nil {
		log.Fatalf("[migrate] database connection failed: %v", err)
	}
	defer database.Close()

	sqlDB, err := db.DB()
	if err != nil {
		log.Fatalf("[migrate] failed to get sql.DB: %v", err)
	}

	// Try both relative paths: from repo root and from apps/api/
	migrationPath := "file://apps/api/migrations"
	if _, err := os.Stat("apps/api/migrations"); os.IsNotExist(err) {
		migrationPath = "file://migrations"
	}

	m, err := migrate.New(
		migrationPath,
		fmt.Sprintf("postgres://%s:%s@%s:%d/%s?sslmode=%s",
			cfg.DB.User, cfg.DB.Password,
			cfg.DB.Host, cfg.DB.Port,
			cfg.DB.Name, cfg.DB.SSLMode,
		),
	)
	if err != nil {
		log.Fatalf("[migrate] failed to init migrate: %v", err)
	}

	args := os.Args[1:]
	if len(args) > 0 && args[0] == "-down" {
		if err := m.Down(); err != nil && err != migrate.ErrNoChange {
			log.Fatalf("[migrate] rollback failed: %v", err)
		}
		log.Println("[migrate] migrations rolled back successfully")
		return
	}

	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		log.Fatalf("[migrate] migration failed: %v", err)
	}

	log.Println("[migrate] migrations applied successfully")

	_ = sqlDB
}
