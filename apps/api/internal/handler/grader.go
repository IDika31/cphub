package handler

import (
	"context"
	"log"
	"time"

	"github.com/IDika31/cphub/api/internal/config"
	"github.com/IDika31/cphub/api/internal/grader"
	"github.com/IDika31/cphub/api/internal/model"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type GraderHandler struct {
	cfg   config.GraderConfig
	queue *grader.Queue
	db    *gorm.DB
}

func NewGraderHandler(cfg config.GraderConfig, queue *grader.Queue, db *gorm.DB) *GraderHandler {
	return &GraderHandler{cfg: cfg, queue: queue, db: db}
}

type RunRequest struct {
	Language       string            `json:"language"`
	SourceCode     string            `json:"sourceCode"`
	TestCases      []grader.TestCase `json:"testCases"`
	TimeoutSeconds int               `json:"timeoutSeconds"`
	TimeLimitMS    int               `json:"timeLimitMs"`
	MemoryLimitMB  int               `json:"memoryLimitMB"`
	ProblemID      string            `json:"problemId"`
}

func (h *GraderHandler) Run(c *fiber.Ctx) error {
	var req RunRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request body"})
	}

	lang := grader.Language(req.Language)
	if !lang.Valid() {
		return c.Status(400).JSON(fiber.Map{"error": "Unsupported language"})
	}

	// Check code size
	if err := grader.ValidateCodeSize(req.SourceCode, h.cfg.MaxCodeSizeKB); err != nil {
		return c.Status(413).JSON(fiber.Map{"error": "GRADER_CODE_TOO_LARGE", "detail": err.Error()})
	}

	// Check firejail
	if err := grader.CheckFirejail(); err != nil {
		return c.Status(503).JSON(fiber.Map{"error": "GRADER_SANDBOX_UNAVAILABLE", "detail": err.Error()})
	}

	// Acquire concurrency slot
	release, err := h.queue.Acquire()
	if err != nil {
		return c.Status(429).JSON(fiber.Map{"error": "GRADER_QUEUE_FULL", "detail": err.Error()})
	}
	defer release()

	// Sanitize code
	sanitized := grader.Sanitize(req.SourceCode, lang)

	// Create temp dir
	td, err := grader.CreateTempDir(lang, sanitized)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "GRADER_TEMP_DIR_FAILED", "detail": err.Error()})
	}
	defer td.Cleanup()

	// Write test cases
	if err := td.WriteTestCases(req.TestCases); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to write test cases", "detail": err.Error()})
	}

	// Compile if needed
	compileErr, err := grader.Compile(context.Background(), lang, td)
	if err != nil {
		return c.JSON(grader.GraderResult{
			Verdict:      grader.VerdictCE,
			TotalTests:   len(req.TestCases),
			CompileError: compileErr,
			Results:      make([]grader.TestResult, 0),
		})
	}

	// Run each test case
	results := make([]grader.TestResult, 0, len(req.TestCases))
	// Resolve per-request time/memory limits; fall back to server defaults.
	memLimitMB := h.cfg.MemoryLimitMB
	if req.MemoryLimitMB > 0 {
		memLimitMB = req.MemoryLimitMB
	}
	opts := grader.RunOptions{
		TimeLimitMS:   h.resolveTimeLimitMS(&req),
		MemoryLimitMB: memLimitMB,
		MaxOutputKB:   h.cfg.MaxOutputKB,
		Profile:       h.cfg.FirejailProfile,
	}

	for i, tc := range req.TestCases {
		execResult, err := grader.RunSandboxed(context.Background(), lang, td, tc.Input, opts)
		if err != nil {
			results = append(results, grader.TestResult{
				Index:   i,
				Verdict: grader.VerdictError,
				Error:   err.Error(),
			})
			continue
		}

		// Determine verdict
		verdict := grader.VerdictAC
		if execResult.TimedOut {
			verdict = grader.VerdictTLE
		} else if execResult.ExitCode != 0 {
			verdict = grader.VerdictRE
		} else if !grader.CompareOutput(tc.Output, execResult.Stdout) {
			verdict = grader.VerdictWA
		}

		results = append(results, grader.TestResult{
			Index:    i,
			Verdict:  verdict,
			Runtime:  execResult.Runtime,
			Memory:   execResult.Memory,
			Input:    tc.Input,
			Expected: tc.Output,
			Output:   execResult.Stdout,
			Error:    execResult.Stderr,
		})
	}

	// Aggregate
	passedTests := 0
	for _, r := range results {
		if r.Verdict == grader.VerdictAC {
			passedTests++
		}
	}

	var maxRuntime int64
	var maxMemory int64
	for _, r := range results {
		if r.Runtime > maxRuntime {
			maxRuntime = r.Runtime
		}
		if r.Memory > maxMemory {
			maxMemory = r.Memory
		}
	}

	aggregate := grader.AggregateVerdict(results)

	// Persist the run as a local submission and update problem solved status.
	// Works for any provider (codeforces, tlx) since it keys off the problem row.
	h.persistRun(c, &req, aggregate, results, passedTests, maxRuntime, maxMemory)

	return c.JSON(grader.GraderResult{
		Verdict:     aggregate,
		TotalTests:  len(req.TestCases),
		PassedTests: passedTests,
		MaxRuntime:  maxRuntime,
		MaxMemory:   maxMemory,
		Results:     results,
	})
}

// persistRun records the grader run as a LocalSubmission and, on full AC,
// marks the problem solved. Best-effort: failures are logged, never block the response.
func (h *GraderHandler) persistRun(c *fiber.Ctx, req *RunRequest, verdict grader.Verdict, results []grader.TestResult, passed int, maxRuntime, maxMemory int64) {
	if h.db == nil || req.ProblemID == "" {
		return
	}
	userIDStr, ok := c.Locals("userId").(string)
	if !ok || userIDStr == "" {
		return
	}
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		return
	}

	// Resolve the problem: ProblemID may be a UUID (web) or a provider problemId string.
	var problem model.Problem
	if pid, perr := uuid.Parse(req.ProblemID); perr == nil {
		err = h.db.First(&problem, "id = ?", pid).Error
	} else {
		err = h.db.First(&problem, "problem_id = ?", req.ProblemID).Error
	}
	if err != nil {
		return
	}

	sub := model.LocalSubmission{
		ID:          uuid.New(),
		UserID:      userID,
		ProblemID:   problem.ID,
		Language:    req.Language,
		SourceCode:  req.SourceCode,
		Verdict:     string(verdict),
		Runtime:     int(maxRuntime),
		Memory:      int(maxMemory),
		PassedTests: passed,
		TotalTests:  len(req.TestCases),
		ExecutedAt:  time.Now(),
	}
	if err := h.db.Create(&sub).Error; err != nil {
		log.Printf("[grader] failed to record submission: %v", err)
	}

	// Full AC → mark solved (don't downgrade an already-solved problem).
	if verdict == grader.VerdictAC && problem.Status != "solved" {
		if err := h.db.Model(&model.Problem{}).Where("id = ?", problem.ID).
			Update("status", "solved").Error; err != nil {
			log.Printf("[grader] failed to mark problem solved: %v", err)
		}
	}
}

// resolveTimeLimitMS picks the per-testcase limit in milliseconds: explicit ms
// from the client, legacy whole seconds, or the server default. Clamped because
// the value arrives in a request body.
func (h *GraderHandler) resolveTimeLimitMS(req *RunRequest) int {
	ms := req.TimeLimitMS
	if ms <= 0 {
		ms = req.TimeoutSeconds * 1000
	}
	if ms <= 0 {
		ms = h.cfg.TimeoutSeconds * 1000
	}
	limit := h.cfg.MaxTimeLimitMS
	if limit <= 0 {
		limit = 15000
	}
	if ms > limit {
		ms = limit
	}
	if ms < 100 {
		ms = 100
	}
	return ms
}

func (h *GraderHandler) Status(c *fiber.Ctx) error {
	active, max := h.queue.Status()
	compilers := grader.CheckCompilers()

	return c.JSON(fiber.Map{
		"component": "grader",
		"queue": fiber.Map{
			"active": active,
			"max":    max,
		},
		"compilers": compilers,
		"firejail":  grader.CheckFirejail() == nil,
	})
}
