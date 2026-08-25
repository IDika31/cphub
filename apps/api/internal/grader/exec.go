package grader

import (
	"context"
	"errors"
	"fmt"
	"os/exec"
	"strings"
	"time"
)

type ExecutionResult struct {
	Stdout   string
	Stderr   string
	ExitCode int
	Runtime  int64
	Memory   int64
	TimedOut bool
}

// RunOptions carries the per-testcase limits. TimeLimitMS is what the verdict is
// judged against; the wall-clock kill lands later (limit + sandbox overhead +
// grace) so sandbox startup never costs a submission a TLE.
type RunOptions struct {
	TimeLimitMS   int
	MemoryLimitMB int
	MaxOutputKB   int
	Profile       string
}

func (o RunOptions) normalize() RunOptions {
	if o.TimeLimitMS <= 0 {
		o.TimeLimitMS = 5000
	}
	if o.MemoryLimitMB <= 0 {
		o.MemoryLimitMB = 512
	}
	if o.MaxOutputKB <= 0 {
		o.MaxOutputKB = 256
	}
	return o
}

// capWriter keeps the first max bytes and swallows the rest. Draining rather
// than blocking is the point: reading the pipe once (the old behaviour) stalled
// any program whose output outgrew the pipe buffer, and that stall was reported
// as TLE.
type capWriter struct {
	max       int
	buf       []byte
	truncated bool
}

func (w *capWriter) Write(p []byte) (int, error) {
	if room := w.max - len(w.buf); room > 0 {
		if len(p) <= room {
			w.buf = append(w.buf, p...)
		} else {
			w.buf = append(w.buf, p[:room]...)
			w.truncated = true
		}
	} else if len(p) > 0 {
		w.truncated = true
	}
	return len(p), nil
}

func (w *capWriter) String() string {
	if w.truncated {
		return string(w.buf) + "\n[... output truncated]"
	}
	return string(w.buf)
}

// Compile compiles source code if the language requires compilation.
func Compile(ctx context.Context, lang Language, td *TempDir) (string, error) {
	cfg := lang.Config()
	if !cfg.IsCompiled {
		return "", nil
	}

	ctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, cfg.CompileCmd, cfg.CompileArgs...)
	cmd.Dir = td.Path
	setProcAttr(cmd)
	cmd.Cancel = func() error { return killProcessGroup(cmd) }
	cmd.WaitDelay = 2 * time.Second

	output, err := cmd.CombinedOutput()
	if err != nil {
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			return "Compilation Error:\ncompiler timed out after 60s", fmt.Errorf("compile timeout")
		}
		return FormatCompileError(string(output)), fmt.Errorf("compilation failed: %w", err)
	}

	return "", nil
}

// Run executes the compiled binary or script directly, without a sandbox.
func Run(ctx context.Context, lang Language, td *TempDir, input string, opts RunOptions) (*ExecutionResult, error) {
	cfg := lang.Config()
	return runProcess(ctx, cfg.RunCmd, cfg.RunArgs, td.Path, input, opts, 0)
}

// runProcess runs one command with stdin/stdout/stderr fully drained in memory,
// kills the whole process group on deadline, and marks TLE only when the
// program's own time (elapsed minus sandbox overhead) passed the limit.
func runProcess(parent context.Context, name string, args []string, dir, input string, opts RunOptions, overhead time.Duration) (*ExecutionResult, error) {
	opts = opts.normalize()
	limit := time.Duration(opts.TimeLimitMS) * time.Millisecond

	ctx, cancel := context.WithTimeout(parent, limit+overhead+TimeGrace())
	defer cancel()

	stdout := &capWriter{max: opts.MaxOutputKB * 1024}
	stderr := &capWriter{max: 4 * 1024}

	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Dir = dir
	cmd.Stdin = strings.NewReader(input)
	cmd.Stdout = stdout
	cmd.Stderr = stderr
	setProcAttr(cmd)
	// Kill the group, not just the direct child: the sandbox payload and any
	// grandchild hold the same pipes, and Wait blocks until they are gone.
	cmd.Cancel = func() error { return killProcessGroup(cmd) }
	cmd.WaitDelay = 2 * time.Second

	start := time.Now()
	err := cmd.Run()
	spent := time.Since(start) - overhead
	if spent < 0 {
		spent = 0
	}

	result := &ExecutionResult{
		Stdout:  stdout.String(),
		Stderr:  stderr.String(),
		Runtime: spent.Milliseconds(),
		Memory:  maxRSSKB(cmd),
	}

	if errors.Is(ctx.Err(), context.DeadlineExceeded) || spent > limit {
		result.TimedOut = true
		return result, nil
	}

	if err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			result.ExitCode = exitErr.ExitCode()
			return result, nil
		}
		return result, fmt.Errorf("execution error: %w", err)
	}

	return result, nil
}
