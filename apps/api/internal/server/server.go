package server

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"time"

	"github.com/IDika31/cphub/api/internal/database"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
)

type Server struct {
	app *fiber.App
	cfg ServerConfig
}

type ServerConfig struct {
	Port string
	Host string
	// CORSOrigins is the deployment's allowlist. Empty falls back to the dev
	// origin so a local run still works without configuration.
	CORSOrigins string
}

func New(cfg ServerConfig) *Server {
	app := fiber.New(fiber.Config{
		AppName:      "CPHub V4",
		ServerHeader: "CPHub",
		ErrorHandler: errorHandler,
		JSONEncoder:  nil, // use standard encoding/json
		JSONDecoder:  nil,
		// App runs behind a reverse proxy (Caddy/Cloudflare): trust
		// X-Forwarded-* so c.IP()/c.Protocol() reflect the real client.
		EnableIPValidation: true,
		ProxyHeader:        fiber.HeaderXForwardedFor,
	})

	app.Use(recover.New())
	app.Use(logger.New(logger.Config{
		Format: "${time} | ${status} | ${latency} | ${method} ${path}\n",
	}))
	origins := cfg.CORSOrigins
	if origins == "" {
		origins = "http://localhost:3000"
	}
	app.Use(cors.New(cors.Config{
		AllowOrigins:     origins,
		AllowMethods:     "GET,POST,PUT,DELETE,PATCH,OPTIONS",
		AllowHeaders:     "Origin,Content-Type,Accept,Authorization,X-HMAC-Signature,X-Nonce,X-Key-Id",
		AllowCredentials: true,
	}))

	return &Server{
		app: app,
		cfg: cfg,
	}
}

func (s *Server) App() *fiber.App {
	return s.app
}

func (s *Server) Listen() error {
	addr := fmt.Sprintf("%s:%s", s.cfg.Host, s.cfg.Port)
	log.Printf("[server] starting on %s", addr)

	go func() {
		if err := s.app.Listen(addr); err != nil {
			log.Fatalf("[server] failed to start: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt)
	<-quit

	log.Println("[server] shutting down...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := database.Close(); err != nil {
		log.Printf("[server] error closing database: %v", err)
	}
	if err := database.CloseRedis(); err != nil {
		log.Printf("[server] error closing redis: %v", err)
	}

	return s.app.ShutdownWithContext(ctx)
}

func errorHandler(c *fiber.Ctx, err error) error {
	code := fiber.StatusInternalServerError
	if e, ok := err.(*fiber.Error); ok {
		code = e.Code
	}
	return c.Status(code).JSON(fiber.Map{
		"error": err.Error(),
	})
}
