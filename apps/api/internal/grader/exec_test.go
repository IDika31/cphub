package grader

import (
	"context"
	"runtime"
	"strings"
	"testing"
	"time"
)

// shell returns a portable "run this command line" argv.
func shell(script string) (string, []string) {
	if runtime.GOOS == "windows" {
		return "cmd", []string{"/c", script}
	}
	return "/bin/sh", []string{"-c", script}
}

func TestCapWriterTruncates(t *testing.T) {
	w := &capWriter{max: 4}
	w.Write([]byte("ab"))
	w.Write([]byte("cdef"))
	w.Write([]byte("ghi"))
	if !strings.HasPrefix(w.String(), "abcd") {
		t.Fatalf("want first 4 bytes kept, got %q", w.String())
	}
	if !strings.Contains(w.String(), "truncated") {
		t.Fatalf("want truncation marker, got %q", w.String())
	}
}

func TestRunProcessEchoesStdin(t *testing.T) {
	name, args := shell("cat")
	if runtime.GOOS == "windows" {
		name, args = shell("more")
	}
	res, err := runProcess(context.Background(), name, args, "", "42\n",
		RunOptions{TimeLimitMS: 5000}, 0)
	if err != nil {
		t.Fatalf("runProcess: %v", err)
	}
	if res.TimedOut {
		t.Fatal("plain echo should not time out")
	}
	if !strings.Contains(res.Stdout, "42") {
		t.Fatalf("stdin not piped through, stdout=%q stderr=%q", res.Stdout, res.Stderr)
	}
}

// A program whose output outgrows the OS pipe buffer used to wedge the grader
// (single Read, then a blocking read of stderr) and got reported as TLE.
func TestRunProcessFloodDoesNotHang(t *testing.T) {
	script := "yes aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa | head -20000"
	if runtime.GOOS == "windows" {
		script = "for /l %i in (1,1,20000) do @echo aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	}
	name, args := shell(script)
	res, err := runProcess(context.Background(), name, args, "", "",
		RunOptions{TimeLimitMS: 20000, MaxOutputKB: 16}, 0)
	if err != nil {
		t.Fatalf("runProcess: %v", err)
	}
	if res.TimedOut {
		t.Fatal("flooding stdout must not be reported as TLE")
	}
	if len(res.Stdout) > 32*1024 {
		t.Fatalf("output not capped: %d bytes", len(res.Stdout))
	}
}

func TestRunProcessTimeLimit(t *testing.T) {
	script := "sleep 5"
	if runtime.GOOS == "windows" {
		script = "ping -n 6 127.0.0.1 >nul"
	}
	name, args := shell(script)
	res, err := runProcess(context.Background(), name, args, "", "",
		RunOptions{TimeLimitMS: 300}, 0)
	if err != nil {
		t.Fatalf("runProcess: %v", err)
	}
	if !res.TimedOut {
		t.Fatalf("want TLE, got runtime=%dms exit=%d", res.Runtime, res.ExitCode)
	}
}

// Sandbox overhead must not be billed to the program: a run that spends less
// than the limit once the wrapper cost is removed is not a TLE.
func TestRunProcessOverheadNotCharged(t *testing.T) {
	script := "sleep 1"
	if runtime.GOOS == "windows" {
		script = "ping -n 2 127.0.0.1 >nul"
	}
	name, args := shell(script)
	res, err := runProcess(context.Background(), name, args, "", "",
		RunOptions{TimeLimitMS: 900}, 2*time.Second)
	if err != nil {
		t.Fatalf("runProcess: %v", err)
	}
	if res.TimedOut {
		t.Fatal("overhead was charged against the time limit")
	}
	if res.Runtime != 0 {
		t.Fatalf("want runtime clamped to 0 after subtracting overhead, got %d", res.Runtime)
	}
}
