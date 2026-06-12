package grader

import (
	"log"
)

// StartupCheck verifies all compilers and firejail at startup.
// Returns a map of warnings for missing tools.
func StartupCheck() map[string]string {
	warnings := make(map[string]string)

	// Check compilers
	compilers := CheckCompilers()
	for name, ok := range compilers {
		if !ok {
			warnings[name] = "compiler not found or not executable"
			log.Printf("[grader] WARNING: %s not found", name)
		} else {
			log.Printf("[grader] compiler OK: %s", name)
		}
	}

	// Check firejail
	if err := CheckFirejail(); err != nil {
		warnings["firejail"] = err.Error()
		log.Printf("[grader] WARNING: firejail not ready: %v", err)
	} else {
		log.Println("[grader] firejail OK")
	}

	// Summary
	if len(warnings) == 0 {
		log.Println("[grader] all compilers and sandbox ready")
	} else {
		log.Printf("[grader] startup complete with %d warnings", len(warnings))
	}

	return warnings
}
