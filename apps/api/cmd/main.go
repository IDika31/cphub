package main

import (
	"log"

	"github.com/IDika31/cphub/api/internal/config"
	"github.com/IDika31/cphub/api/internal/database"
	"github.com/IDika31/cphub/api/internal/server"
)

func main() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	log.Println("[cphub] starting CPHub V4 API...")

	// Load configuration
	cfg := config.Load()

	// Connect to PostgreSQL
	db, err := database.Connect(cfg.DB)
	if err != nil {
		log.Fatalf("[cphub] database connection failed: %v", err)
	}
	log.Printf("[cphub] PostgreSQL connected: %s:%d/%s", cfg.DB.Host, cfg.DB.Port, cfg.DB.Name)

	// Connect to Redis
	rdb, err := database.ConnectRedis(cfg.Redis)
	if err != nil {
		log.Fatalf("[cphub] Redis connection failed: %v", err)
	}
	log.Printf("[cphub] Redis connected: %s:%d", cfg.Redis.Host, cfg.Redis.Port)

	// Close connections on exit
	defer func() {
		if err := database.Close(); err != nil {
			log.Printf("[cphub] error closing database: %v", err)
		}
		if err := database.CloseRedis(); err != nil {
			log.Printf("[cphub] error closing redis: %v", err)
		}
	}()

	// Keep db and rdb references
	_ = db
	_ = rdb

	// Create and start server
	srv := server.New(server.ServerConfig{
		Host: cfg.Server.Host,
		Port: cfg.Server.Port,
	})

	// Register routes
	registerRoutes(srv.App())

	// Start listening (blocks until shutdown)
	if err := srv.Listen(); err != nil {
		log.Fatalf("[cphub] server error: %v", err)
	}

	log.Println("[cphub] shutdown complete")
}

func registerRoutes(app *fiber.App) {
	app.Get("/api/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"status": "ok",
			"service": "cphub-api",
			"version": "4.0.0",
		})
	})
}
