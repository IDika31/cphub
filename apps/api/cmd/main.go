package main

import (
	"log"

	"github.com/IDika31/cphub/api/internal/config"
	"github.com/IDika31/cphub/api/internal/database"
	"github.com/IDika31/cphub/api/internal/grader"
	"github.com/IDika31/cphub/api/internal/handler"
	"github.com/IDika31/cphub/api/internal/middleware"
	"github.com/IDika31/cphub/api/internal/provider/cloudflare"
	"github.com/IDika31/cphub/api/internal/provider/codeforces"
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

	// Startup check: verify compilers and firejail, then measure sandbox
	// overhead so it is not charged against a submission time limit.
	_ = grader.StartupCheck()
	grader.SetTuning(cfg.Grader.TimeGraceMS, cfg.Grader.SandboxOverheadMS)

	// Point Codeforces at a headless browser. It is what clears the Cloudflare
	// managed challenge on codeforces.com, and therefore what makes the whole site
	// usable rather than only the live contests the m1/m3 mirrors carry. A missing
	// browser is reported and then ignored: the mirror path still works.
	if cfg.Browser.Disabled {
		log.Println("[cphub] Codeforces browser solver disabled — mirrors only (live contests)")
	} else if path, err := codeforces.EnableBrowserSolver(cloudflare.BrowserOptions{
		Path:      cfg.Browser.Path,
		Timeout:   cfg.Browser.Timeout,
		NoSandbox: cfg.Browser.NoSandbox,
	}); err != nil {
		log.Printf("[cphub] Codeforces browser solver unavailable, mirrors only: %v", err)
	} else {
		log.Printf("[cphub] Codeforces browser solver ready: %s", path)
	}

	// Repositories
	_ = repository.NewUserRepository(db) // used by handlers via direct DB access
	problemRepo := repository.NewProblemRepository(db)
	submissionRepo := repository.NewSubmissionRepository(db)

	// Services
	authSvc := service.NewAuthService(db, cfg.JWT)

	// Handlers
	authHandler := handler.NewAuthHandler(authSvc)
	graderHandler := handler.NewGraderHandler(cfg.Grader, grader.GetQueue(), db)
	syncHandler := handler.NewSyncHandler(problemRepo, submissionRepo, db)
	problemHandler := handler.NewProblemHandler(problemRepo, codeforces.NewScraper(), codeforces.NewAPI(cfg.CFAPIKey, cfg.CFAPISecret))
	submissionHandler := handler.NewSubmissionHandler(submissionRepo)
	dashboardHandler := handler.NewDashboardHandler(db)
	accountHandler := handler.NewAccountHandler(db, cfg.CF.ClientID, cfg.CF.ClientSecret, cfg.CF.RedirectURL)
	settingsHandler := handler.NewSettingsHandler(db)
	snippetHandler := handler.NewSnippetHandler(db)
	extKeyHandler := handler.NewExtensionKeyHandler(db)
	tlxImportHandler := handler.NewTLXImportHandler(db, problemRepo)
	tlxSubmitHandler := handler.NewTLXSubmitHandler(db, problemRepo, submissionRepo)
	cfSyncHandler := handler.NewCFSyncHandler(db, cfg.CFAPIKey, cfg.CFAPISecret)
	cfWebHandler := handler.NewCFWebHandler(db, cfg.CFAPIKey, cfg.CFAPISecret, cfg.CredEncKey)

	// Create and start server
	srv := server.New(server.ServerConfig{
		Host:        cfg.Server.Host,
		Port:        cfg.Server.Port,
		CORSOrigins: cfg.Server.CORSOrigins,
	})

	_ = rdb

	app := srv.App()

	// Register routes
	registerRoutes(app, authHandler, graderHandler, syncHandler, problemHandler, submissionHandler, dashboardHandler, accountHandler, settingsHandler, snippetHandler, extKeyHandler, tlxImportHandler, tlxSubmitHandler, cfSyncHandler, cfWebHandler, cfg)

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
	extKeyHandler *handler.ExtensionKeyHandler,
	tlxImportHandler *handler.TLXImportHandler,
	tlxSubmitHandler *handler.TLXSubmitHandler,
	cfSyncHandler *handler.CFSyncHandler,
	cfWebHandler *handler.CFWebHandler,
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
			"&scope=openid%20email%20profile" +
			"&state=" + cfg.Server.WebBaseURL
		return c.Redirect(redirectURL, 302)
	})
	auth.Get("/google/callback", authHandler.GoogleCallback)
	// Extension pairing key (per account)
	auth.Get("/hmac-secret", middleware.AuthRequired(cfg.JWT), extKeyHandler.Get)
	auth.Post("/hmac-secret/rotate", middleware.AuthRequired(cfg.JWT), extKeyHandler.Rotate)
	auth.Get("/me", middleware.AuthRequired(cfg.JWT), authHandler.Me)
	auth.Post("/logout", middleware.AuthRequired(cfg.JWT), authHandler.Logout)

	// Sync (HMAC protected)
	sync := app.Group("/api/sync")
	sync.Use(middleware.HMACVerify(database.DB))
	sync.Post("/problem", syncHandler.SyncProblem)
	sync.Post("/submission", syncHandler.SyncSubmission)
	// Custom TLX hosts added in the extension become their own Connections entry.
	sync.Post("/tlx-hosts", syncHandler.SyncTLXHosts)
	// The extension captures a Codeforces session in the user's own browser and hands
	// it over here, so no password ever reaches CPHub.
	sync.Post("/cf-session", cfWebHandler.SessionFromExtension)
	// Registration state read off Codeforces' own contest list in the user's browser —
	// the only accurate source, since no read API exposes it.
	sync.Post("/cf-contest-states", cfWebHandler.ContestStatesFromExtension)

	// Problems (JWT protected)
	problems := app.Group("/api/problems", middleware.AuthRequired(cfg.JWT))
	problems.Get("/", problemHandler.List)
	problems.Get("/search", problemHandler.Search)
	problems.Get("/by-provider/:provider/:problemId", problemHandler.GetByProviderAndID)
	problems.Get("/by-problem-id/:problemId", problemHandler.GetByProblemID)
	problems.Get("/:id", problemHandler.GetByID)
	problems.Post("/import-tlx", tlxImportHandler.ImportTLX)
	problems.Post("/submit-tlx", tlxSubmitHandler.SubmitTLX)

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
	// Self-hosted Judgels/TLX: same endpoints, different apiUrl.
	accounts.Post("/tlx-custom", accountHandler.LinkTLXCustom)

	// Codeforces OAuth (JWT required to link, callback is public)
	auth.Get("/codeforces/callback", handler.HandleCodeforcesCallback(database.DB, handler.CFConfig{
		ClientID:     cfg.CF.ClientID,
		ClientSecret: cfg.CF.ClientSecret,
		RedirectURL:  cfg.CF.RedirectURL,
		WebBaseURL:   cfg.Server.WebBaseURL,
	}))

	// Extension download (public) — rebuilds the zip when the source changed.
	if extDownloadHandler, err := handler.NewExtensionDownloadHandler(); err != nil {
		log.Printf("[cphub] extension download disabled: %v", err)
	} else {
		app.Get("/api/extension/download", extDownloadHandler.Download)
	}

	// Dashboard
	dashboard := app.Group("/api/dashboard", middleware.AuthRequired(cfg.JWT))
	dashboard.Post("/sync-cf", dashboardHandler.SyncCF)
	dashboard.Post("/sync-tlx", dashboardHandler.SyncTLX)
	dashboard.Get("/overview", dashboardHandler.Overview)
	dashboard.Get("/rating", dashboardHandler.RatingHistory)
	dashboard.Get("/activity", dashboardHandler.Activity)
	dashboard.Get("/heatmap", dashboardHandler.Heatmap)
	dashboard.Get("/tag-weakness", dashboardHandler.TagWeakness)

	// Codeforces via the official API. Separate from /api/sync, which is the
	// extension's HMAC-signed door: these are user-triggered from the web app, so
	// they sit behind the JWT like every other page action.
	cf := app.Group("/api/cf", middleware.AuthRequired(cfg.JWT))
	cf.Post("/problemset/sync", cfSyncHandler.SyncProblemset)
	cf.Post("/contests/sync", cfSyncHandler.SyncContests)
	cf.Post("/contests/:id/problems/sync", cfSyncHandler.SyncContestProblems)

	// Codeforces web session: the three things the official API has no method for.
	cf.Post("/login", cfWebHandler.Login)
	cf.Get("/languages", cfWebHandler.Languages)
	cf.Post("/submit", cfWebHandler.Submit)
	// The extension submits from the user's own browser and then asks for the verdict
	// here, because user.status is on the API host and needs no session or clearance.
	cf.Post("/submit/observe", cfWebHandler.ObserveSubmit)

	contests := app.Group("/api/contests", middleware.AuthRequired(cfg.JWT))
	contests.Get("/", cfSyncHandler.ListContests)
	contests.Post("/:id/register", cfWebHandler.Register)
	// The extension registers in the user's own browser and then reports it here, so
	// CPHub's list reflects it without the server needing a Codeforces session at all.
	contests.Post("/:id/registered", cfWebHandler.RecordRegistration)

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
