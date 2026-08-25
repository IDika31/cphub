//go:build windows

package grader

import (
	"os/exec"
)

// CheckFirejail is a no-op on Windows — sandbox not available.
func CheckFirejail() error {
	return nil
}

// SandboxAvailable reports whether sandboxed execution is possible.
func SandboxAvailable() bool {
	return false
}

// CheckCompilers verifies compilers are reachable via PATH on Windows.
func CheckCompilers() map[string]bool {
	names := []string{"g++", "python", "node", "javac", "java"}
	status := make(map[string]bool)
	for _, name := range names {
		_, err := exec.LookPath(name)
		status[name] = err == nil
	}
	return status
}
