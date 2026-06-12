package grader

import (
	"fmt"
	"os"
	"os/exec"
)

// CheckFirejail verifies firejail is installed and functional
func CheckFirejail() error {
	// Check binary exists
	if _, err := os.Stat("/usr/bin/firejail"); os.IsNotExist(err) {
		return fmt.Errorf("GRADER_SANDBOX_UNAVAILABLE: firejail not found at /usr/bin/firejail")
	}

	// Check suid bit
	info, err := os.Stat("/usr/bin/firejail")
	if err != nil {
		return fmt.Errorf("GRADER_SANDBOX_UNAVAILABLE: cannot stat firejail: %w", err)
	}
	if info.Mode()&os.ModeSetuid == 0 {
		return fmt.Errorf("GRADER_SANDBOX_UNAVAILABLE: firejail suid bit not set — run: sudo chmod u+s /usr/bin/firejail")
	}

	return nil
}

// CheckCompilers verifies all required compilers are available
func CheckCompilers() map[string]bool {
	compilers := map[string]string{
		"g++":     "/usr/bin/g++",
		"python3": "/usr/bin/python3",
		"node":    "/usr/bin/node",
		"javac":   "/usr/bin/javac",
		"java":    "/usr/bin/java",
	}

	status := make(map[string]bool)
	for name, path := range compilers {
		cmd := exec.Command(path, "--version")
		if err := cmd.Run(); err != nil {
			status[name] = false
		} else {
			status[name] = true
		}
	}
	return status
}
