package grader

import (
	"context"
	"fmt"
	"os/exec"
	"syscall"
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

// Compile compiles source code if language requires compilation
func Compile(ctx context.Context, lang Language, td *TempDir) (string, error) {
	cfg := lang.Config()
	if !cfg.IsCompiled {
		return "", nil
	}

	args := make([]string, len(cfg.CompileArgs))
	copy(args, cfg.CompileArgs)

	cmd := exec.CommandContext(ctx, cfg.CompileCmd, args...)
	cmd.Dir = td.Path
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}

	output, err := cmd.CombinedOutput()
	if err != nil {
		return FormatCompileError(string(output)), fmt.Errorf("compilation failed: %w", err)
	}

	return "", nil
}

// Run executes the compiled binary or script with given input
func Run(ctx context.Context, lang Language, td *TempDir, input string) (*ExecutionResult, error) {
	cfg := lang.Config()
	start := time.Now()

	args := make([]string, len(cfg.RunArgs))
	copy(args, cfg.RunArgs)

	cmd := exec.CommandContext(ctx, cfg.RunCmd, args...)
	cmd.Dir = td.Path
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}

	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, fmt.Errorf("failed to create stdin pipe: %w", err)
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("failed to create stdout pipe: %w", err)
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, fmt.Errorf("failed to create stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("failed to start process: %w", err)
	}

	// Write input
	if input != "" {
		stdin.Write([]byte(input))
	}
	stdin.Close()

	// Capture output with size limit
	outBytes := make([]byte, 10*1024) // 10 KB
	n, _ := stdout.Read(outBytes)
	errBytes := make([]byte, 4*1024) // 4 KB
	m, _ := stderr.Read(errBytes)

	err = cmd.Wait()
	runtime := time.Since(start).Milliseconds()

	result := &ExecutionResult{
		Stdout:  string(outBytes[:n]),
		Stderr:  string(errBytes[:m]),
		Runtime: runtime,
	}

	if err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			result.TimedOut = true
			return result, nil
		}
		if exitErr, ok := err.(*exec.ExitError); ok {
			result.ExitCode = exitErr.ExitCode()
			return result, nil
		}
		return result, fmt.Errorf("execution error: %w", err)
	}

	return result, nil
}

// RunFirejail executes via firejail sandbox
func RunFirejail(ctx context.Context, lang Language, td *TempDir, input string, firejailProfile string) (*ExecutionResult, error) {
	cfg := lang.Config()
	start := time.Now()

	firejailArgs := []string{
		fmt.Sprintf("--profile=%s", firejailProfile),
		"--quiet",
		cfg.RunCmd,
	}
	firejailArgs = append(firejailArgs, cfg.RunArgs...)

	cmd := exec.CommandContext(ctx, "/usr/bin/firejail", firejailArgs...)
	cmd.Dir = td.Path
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}

	stdin, _ := cmd.StdinPipe()
	stdout, _ := cmd.StdoutPipe()
	stderr, _ := cmd.StderrPipe()

	cmd.Start()
	if input != "" {
		stdin.Write([]byte(input))
	}
	stdin.Close()

	outBytes := make([]byte, 10*1024)
	n, _ := stdout.Read(outBytes)
	errBytes := make([]byte, 4*1024)
	m, _ := stderr.Read(errBytes)

	err := cmd.Wait()
	runtime := time.Since(start).Milliseconds()

	result := &ExecutionResult{
		Stdout:  string(outBytes[:n]),
		Stderr:  string(errBytes[:m]),
		Runtime: runtime,
	}

	if err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			result.TimedOut = true
			return result, nil
		}
		if exitErr, ok := err.(*exec.ExitError); ok {
			result.ExitCode = exitErr.ExitCode()
			return result, nil
		}
	}

	return result, nil
}

// KillProcessGroup kills entire process tree
func KillProcessGroup(cmd *exec.Cmd) error {
	if cmd.Process == nil {
		return nil
	}
	return syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
}
