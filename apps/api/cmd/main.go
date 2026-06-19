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
	dashboardHandler := handler.NewDashboardHandler(db)
	accountHandler := handler.NewAccountHandler(db, cfg.CF.ClientID, cfg.CF.ClientSecret, cfg.CF.RedirectURL)
	settingsHandler := handler.NewSettingsHandler(db)
	snippetHandler := handler.NewSnippetHandler(db)
	tlxImportHandler := handler.NewTLXImportHandler(db, problemRepo)

	// Create and start server
	srv := server.New(server.ServerConfig{
		Host: cfg.Server.Host,
		Port: cfg.Server.Port,
	})

	_ = rdb

	app := srv.App()

	// Register routes
	registerRoutes(app, authHandler, graderHandler, syncHandler, problemHandler, submissionHandler, dashboardHandler, accountHandler, settingsHandler, snippetHandler, tlxImportHandler, cfg)

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
	settingsHandler *handler.SettingsHandler,
	snippetHandler *handler.SnippetHandler,
	tlxImportHandler *handler.TLXImportHandler,
	cfg *config.Config,
) {
	// Health
	app.Get("/api/health", dashboardHandler.Health)

	// Auth
	auth := app.Group("/api/auth")
	auth.Post("/register", authHandler.Register)
	auth.Post("/login", authHandler.Login)
	auth.Get("/google", func(c *fiber.Ctx) error {
		redirectURL := "https://accounts.google.com/o/oauth2/v2/auth" +
			"?client_id=" + cfg.Google.ClientID +
			"&redirect_uri=" + cfg.Google.RedirectURL +
			"&response_type=code" +
			"&scope=openid%20email%20profile"
		return c.Redirect(redirectURL, 302)
	})
	auth.Get("/google/callback", authHandler.GoogleCallback)
	auth.Get("/hmac-secret", middleware.AuthRequired(cfg.JWT), func(c *fiber.Ctx) error {
    return c.JSON(fiber.Map{"secret": cfg.Extension.HMACSecret})
})
	auth.Get("/me", middleware.AuthRequired(cfg.JWT), authHandler.Me)
	auth.Post("/logout", middleware.AuthRequired(cfg.JWT), authHandler.Logout)

	// Sync (HMAC protected)
	sync := app.Group("/api/sync")
	sync.Use(middleware.HMACVerify(cfg.Extension))
	sync.Post("/problem", syncHandler.SyncProblem)
	sync.Post("/submission", syncHandler.SyncSubmission)

	// Problems (JWT protected)
	problems := app.Group("/api/problems", middleware.AuthRequired(cfg.JWT))
	problems.Get("/", problemHandler.List)
	problems.Get("/search", problemHandler.Search)
	problems.Get("/:id", problemHandler.GetByID)
	problems.Get("/by-provider/:provider/:problemId", problemHandler.GetByProviderAndID)
	problems.Post("/import-tlx", tlxImportHandler.ImportTLX)

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

	// Codeforces OAuth (JWT required to link, callback is public)
	auth.Get("/codeforces/callback", handler.HandleCodeforcesCallback(database.DB, handler.CFConfig{
		ClientID:     cfg.CF.ClientID,
		ClientSecret: cfg.CF.ClientSecret,
		RedirectURL:  cfg.CF.RedirectURL,
	}))

	// Dashboard
	dashboard := app.Group("/api/dashboard", middleware.AuthRequired(cfg.JWT))
		dashboard.Post("/sync-cf", dashboardHandler.SyncCF)
		dashboard.Get("/overview", dashboardHandler.Overview)
		dashboard.Get("/rating", dashboardHandler.RatingHistory)
		dashboard.Get("/heatmap", dashboardHandler.Heatmap)
		dashboard.Get("/tag-weakness", dashboardHandler.TagWeakness)

	// Settings
	settingsGroup := app.Group("/api/settings", middleware.AuthRequired(cfg.JWT))
	settingsGroup.Get("/", settingsHandler.Get)
	settingsGroup.Put("/", settingsHandler.Update)

	// Snippets
	snippets := app.Group("/api/snippets", middleware.AuthRequired(cfg.JWT))
	snippets.Get("/", snippetHandler.List)
	snippets.Post("/", snippetHandler.Create)
	snippets.Delete("/:id", snippetHandler.Delete)
	snippets.Get("/search", snippetHandler.Search)
}
