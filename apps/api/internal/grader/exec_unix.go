//go:build !windows

package grader

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/exec"
	"time"
)

const firejailPath = "/usr/bin/firejail"

// firejailArgs builds the sandbox command line.
//
// No profile is used by default, on purpose. A `timeout` directive inside a
// profile keeps the sandbox alive for its full duration even after the payload
// exits, which turned every single run into a TLE; the same trap applies to
// `--timeout` on the command line. Wall-clock limits belong to the Go context
// (see runProcess), which SIGKILLs the process group on deadline.
func firejailArgs(dir string, opts RunOptions) []string {
	args := []string{"--quiet"}
	if opts.Profile != "" {
		args = append(args, "--profile="+opts.Profile)
	} else {
		args = append(args,
			"--noprofile",
			"--net=none",
			"--caps.drop=all",
			"--nonewprivs",
			"--nogroups",
			"--seccomp",
			"--private-dev",
			"--read-only=/usr",
		)
	}
	args = append(args,
		"--whitelist="+dir,
		// ponytail: rlimit-as caps virtual address space, which the JVM and V8
		// reserve generously. If java/node submissions fail to start, raise
		// GRADER_MEMORY_LIMIT_MB or switch those languages to cgroup limits.
		fmt.Sprintf("--rlimit-as=%d", int64(opts.MemoryLimitMB)*1024*1024),
		fmt.Sprintf("--rlimit-fsize=%d", 64*1024*1024),
		// Integer-second CPU backstop for runaway loops, deliberately above the
		// wall deadline so it never decides a verdict.
		fmt.Sprintf("--rlimit-cpu=%d", (opts.TimeLimitMS+999)/1000+2),
	)
	return args
}

// RunFirejail executes the program inside a firejail sandbox.
func RunFirejail(ctx context.Context, lang Language, td *TempDir, input string, opts RunOptions) (*ExecutionResult, error) {
	cfg := lang.Config()
	opts = opts.normalize()

	args := firejailArgs(td.Path, opts)
	args = append(args, cfg.RunCmd)
	args = append(args, cfg.RunArgs...)

	return runProcess(ctx, firejailPath, args, td.Path, input, opts, SandboxOverhead())
}

// RunSandboxed executes code in the firejail sandbox on Linux.
func RunSandboxed(ctx context.Context, lang Language, td *TempDir, input string, opts RunOptions) (*ExecutionResult, error) {
	return RunFirejail(ctx, lang, td, input, opts)
}

// measureSandboxOverhead times an empty sandboxed run so the wrapper's own cost
// is not charged to the submission. Takes the best of three; a slow first run is
// page-cache warm-up, not the steady state.
func measureSandboxOverhead() {
	if err := CheckFirejail(); err != nil {
		return
	}

	noop := "/usr/bin/true"
	if _, err := os.Stat(noop); err != nil {
		noop = "/bin/true"
	}

	// The whitelist must be a real subdirectory. firejail rejects the tmpfs root
	// outright ("invalid whitelist path /tmp"), which made every probe exit 1 and
	// silently left the measured overhead at zero.
	probeDir, err := os.MkdirTemp("", "cphub-probe-")
	if err != nil {
		log.Printf("[grader] sandbox overhead probe skipped: %v", err)
		return
	}
	defer os.RemoveAll(probeDir)

	base := firejailArgs(probeDir, RunOptions{}.normalize())
	best := time.Duration(0)
	for i := 0; i < 3; i++ {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		cmd := exec.CommandContext(ctx, firejailPath, append(append([]string{}, base...), noop)...)
		cmd.Dir = probeDir
		setProcAttr(cmd)
		start := time.Now()
		err := cmd.Run()
		cancel()
		if err != nil {
			log.Printf("[grader] sandbox overhead probe failed: %v", err)
			return
		}
		if d := time.Since(start); best == 0 || d < best {
			best = d
		}
	}

	if best > 2*time.Second {
		log.Printf("[grader] WARNING: sandbox startup took %v — capping overhead at 2s", best)
		best = 2 * time.Second
	}
	overheadMS.Store(best.Milliseconds())
}
