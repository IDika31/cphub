//go:build !windows

package grader

import (
	"os/exec"
	"syscall"
)

func setProcAttr(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
}

func killProcessGroup(cmd *exec.Cmd) error {
	if cmd.Process == nil {
		return nil
	}
	return syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
}

// maxRSSKB reports the peak resident set size of the finished child, in KB.
// Linux charges the parent's rusage with the high-water mark of every reaped
// descendant, so this covers the payload even though the direct child is
// firejail. Reported memory used to be hardcoded 0 for every submission.
func maxRSSKB(cmd *exec.Cmd) int64 {
	if cmd.ProcessState == nil {
		return 0
	}
	ru, ok := cmd.ProcessState.SysUsage().(*syscall.Rusage)
	if !ok || ru == nil {
		return 0
	}
	if ru.Maxrss <= 0 {
		return 0
	}
	// Linux reports kilobytes; darwin reports bytes.
	return normalizeMaxRSS(int64(ru.Maxrss))
}
