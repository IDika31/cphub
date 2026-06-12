package handler

import (
	"context"
	"fmt"
	"time"

	"github.com/IDika31/cphub/api/internal/config"
	"github.com/IDika31/cphub/api/internal/grader"
	"github.com/gofiber/fiber/v2"
)

type GraderHandler struct {
	cfg   config.GraderConfig
	queue *grader.Queue
}

func NewGraderHandler(cfg config.GraderConfig, queue *grader.Queue) *GraderHandler {
	return &GraderHandler{cfg: cfg, queue: queue}
}

type RunRequest struct {
	Language       string            `json:"language"`
	SourceCode     string            `json:"sourceCode"`
	TestCases      []grader.TestCase `json:"testCases"`
	TimeoutSeconds int               `json:"timeoutSeconds"`
	MemoryLimitMB  int               `json:"memoryLimitMB"`
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
			Verdict:       grader.VerdictCE,
			TotalTests:    len(req.TestCases),
			CompileError:  compileErr,
			Results:       make([]grader.TestResult, 0),
		})
	}

	// Run each test case
	results := make([]grader.TestResult, 0, len(req.TestCases))
	for i, tc := range req.TestCases {
		timeout := h.cfg.TimeoutSeconds
		if req.TimeoutSeconds > 0 {
			timeout = req.TimeoutSeconds
		}
		ctx, cancel := context.WithTimeout(context.Background(),
			time.Duration(timeout)*time.Second)
		defer cancel()

		execResult, err := grader.RunFirejail(ctx, lang, td, tc.Input, h.cfg.FirejailProfile)
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
	for _, r := range results {
		if r.Runtime > maxRuntime {
			maxRuntime = r.Runtime
		}
	}

	return c.JSON(grader.GraderResult{
		Verdict:     grader.AggregateVerdict(results),
		TotalTests:  len(req.TestCases),
		PassedTests: passedTests,
		MaxRuntime:  maxRuntime,
		Results:     results,
	})
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

// Simple stub to avoid import issues
var _ = fmt.Sprintf
