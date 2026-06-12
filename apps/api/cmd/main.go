package main

import (
	"log"

	"github.com/IDika31/cphub/api/internal/config"
	"github.com/IDika31/cphub/api/internal/database"
	"github.com/IDika31/cphub/api/internal/grader"
	"github.com/IDika31/cphub/api/internal/handler"
	"github.com/IDika31/cphub/api/internal/middleware"
	"github.com/IDika31/cphub/api/internal/repository"
	"github.com/IDika31/cphub/api/internal/server"
	"github.com/IDika31/cphub/api/internal/service"
	"github.com/gofiber/fiber/v2"
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

	defer func() {
		if err := database.Close(); err != nil {
			log.Printf("[cphub] error closing database: %v", err)
		}
		if err := database.CloseRedis(); err != nil {
			log.Printf("[cphub] error closing redis: %v", err)
		}
	}()

	// Initialize grader queue
	grader.InitQueue(cfg.Grader.MaxConcurrent)

	// Startup check: verify compilers and firejail
	_ = grader.StartupCheck()

	// Repositories
	_ = repository.NewUserRepository(db) // used by handlers via direct DB access
	problemRepo := repository.NewProblemRepository(db)
	submissionRepo := repository.NewSubmissionRepository(db)

	// Services
	authSvc := service.NewAuthService(db, cfg.JWT)

	// Handlers
	authHandler := handler.NewAuthHandler(authSvc)
	graderHandler := handler.NewGraderHandler(cfg.Grader, grader.GetQueue())
	syncHandler := handler.NewSyncHandler(problemRepo, submissionRepo)
	problemHandler := handler.NewProblemHandler(problemRepo)
	submissionHandler := handler.NewSubmissionHandler(submissionRepo)
	dashboardHandler := handler.NewDashboardHandler()
	accountHandler := handler.NewAccountHandler(db)

	// Create and start server
	srv := server.New(server.ServerConfig{
		Host: cfg.Server.Host,
		Port: cfg.Server.Port,
	})

	_ = rdb

	app := srv.App()

	// Register routes
	registerRoutes(app, authHandler, graderHandler, syncHandler, problemHandler, submissionHandler, dashboardHandler, accountHandler, cfg)

	// Start listening (blocks until shutdown)
	if err := srv.Listen(); err != nil {
		log.Fatalf("[cphub] server error: %v", err)
	}

	log.Println("[cphub] shutdown complete")
}

func registerRoutes(
	app *fiber.App,
	authHandler *handler.AuthHandler,
	graderHandler *handler.GraderHandler,
	syncHandler *handler.SyncHandler,
	problemHandler *handler.ProblemHandler,
	submissionHandler *handler.SubmissionHandler,
	dashboardHandler *handler.DashboardHandler,
	accountHandler *handler.AccountHandler,
	cfg *config.Config,
) {
	// Health
	app.Get("/api/health", dashboardHandler.Health)

	// Auth
	auth := app.Group("/api/auth")
	auth.Post("/register", authHandler.Register)
	auth.Post("/login", authHandler.Login)
	auth.Get("/google", authHandler.GoogleLogin)
	auth.Get("/google/callback", authHandler.GoogleCallback)
	auth.Get("/me", middleware.AuthRequired(cfg.JWT), authHandler.Me)
	auth.Post("/logout", middleware.AuthRequired(cfg.JWT), authHandler.Logout)

	// Sync (HMAC protected)
	sync := app.Group("/api/sync")
	sync.Use(middleware.HMACVerify(cfg.Extension))
	sync.Post("/problem", syncHandler.SyncProblem)
	sync.Post("/submission", syncHandler.SyncSubmission)

	// Problems (public read, optional auth)
	problems := app.Group("/api/problems", middleware.AuthRequired(cfg.JWT))
	problems.Get("/", problemHandler.List)
	problems.Get("/search", problemHandler.Search)
	problems.Get("/:id", problemHandler.GetByID)

	// Grader
	graderGroup := app.Group("/api/grader", middleware.AuthRequired(cfg.JWT))
	graderGroup.Post("/run", graderHandler.Run)
	graderGroup.Get("/status", graderHandler.Status)

	// Submissions
	submissions := app.Group("/api/submissions", middleware.AuthRequired(cfg.JWT))
	submissions.Get("/local", submissionHandler.ListLocal)
	submissions.Get("/external", submissionHandler.ListExternal)

	// Accounts
	accounts := app.Group("/api/accounts", middleware.AuthRequired(cfg.JWT))
	accounts.Get("/", accountHandler.List)
	accounts.Delete("/:id", accountHandler.Unlink)
	accounts.Post("/codeforces", accountHandler.LinkCodeforces)
	accounts.Post("/tlx", accountHandler.LinkTLX)

	// Dashboard
	dashboard := app.Group("/api/dashboard", middleware.AuthRequired(cfg.JWT))
	dashboard.Get("/overview", dashboardHandler.Overview)
	dashboard.Get("/rating", dashboardHandler.RatingHistory)
	dashboard.Get("/heatmap", dashboardHandler.Heatmap)
	dashboard.Get("/tag-weakness", dashboardHandler.TagWeakness)
}
