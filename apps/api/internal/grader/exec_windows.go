//go:build windows

package grader

import (
	"context"
	"log"
)

// RunSandboxed executes code directly without sandbox on Windows.
func RunSandboxed(ctx context.Context, lang Language, td *TempDir, input string, opts RunOptions) (*ExecutionResult, error) {
	log.Println("[grader] running without sandbox (Windows)")
	return Run(ctx, lang, td, input, opts)
}

// measureSandboxOverhead is a no-op: there is no sandbox wrapper on Windows.
func measureSandboxOverhead() {}
