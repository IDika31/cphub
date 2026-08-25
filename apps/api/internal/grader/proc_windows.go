//go:build windows

package grader

import (
	"os/exec"
	"syscall"
)

func setProcAttr(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		CreationFlags: syscall.CREATE_NEW_PROCESS_GROUP,
	}
}

func killProcessGroup(cmd *exec.Cmd) error {
	if cmd.Process == nil {
		return nil
	}
	return cmd.Process.Kill()
}

// maxRSSKB has no cheap equivalent on Windows: ProcessState.SysUsage() returns
// a *syscall.Rusage without a peak-RSS field, and the process handle is already
// closed by the time Wait returns. Windows is the dev target, Linux is where
// submissions are graded, so this stays 0 rather than pulling in a job-object
// wrapper nobody would exercise.
func maxRSSKB(cmd *exec.Cmd) int64 { return 0 }
