package grader

import (
	"fmt"
	"regexp"
	"strings"
)

// Patterns berbahaya yang distrip sebelum eksekusi
var dangerousPatterns = []*regexp.Regexp{
	// C++ dangerous includes
	regexp.MustCompile(`(?m)^\s*#include\s*<\s*filesystem\s*>`),

	// System calls — semua bahasa
	regexp.MustCompile(`(?m)std::system\s*\(`),
	regexp.MustCompile(`(?m)std::popen\s*\(`),
	regexp.MustCompile(`(?m)\bexec[lvpe]*\s*\(`),
	regexp.MustCompile(`(?m)\bfork\s*\(`),

	// Python dangerous
	regexp.MustCompile(`(?m)\bos\.system\s*\(`),
	regexp.MustCompile(`(?m)\bos\.popen\s*\(`),
	regexp.MustCompile(`(?m)\bsubprocess\s*\.`),
	regexp.MustCompile(`(?m)\bshutil\s*\.`),
	regexp.MustCompile(`(?m)\b__import__\s*\(\s*['"]os['"]`),
	regexp.MustCompile(`(?m)\bopen\s*\(.*['"]\/.*['"]`), // file write to absolute paths

	// Java dangerous
	regexp.MustCompile(`(?m)Runtime\.getRuntime\(\)\.exec\s*\(`),
	regexp.MustCompile(`(?m)ProcessBuilder\s*\(`),

	// Node.js dangerous
	regexp.MustCompile(`(?m)require\s*\(\s*['"]child_process['"]`),
	regexp.MustCompile(`(?m)require\s*\(\s*['"]fs['"]`),
	regexp.MustCompile(`(?m)\.execSync\s*\(`),
	regexp.MustCompile(`(?m)\.exec\s*\(`),
}

// Sanitize kode — replace dangerous patterns with comment
func Sanitize(source string, lang Language) string {
	s := source

	// Block patterns regardless of language
	for _, pattern := range dangerousPatterns {
		s = pattern.ReplaceAllString(s, "// [CPHub: blocked dangerous call]")
	}

	// Language-specific checks
	switch lang {
	case LangCPP17, LangCPP20:
		// Block raw syscall
		s = strings.ReplaceAll(s, "syscall(", "// [CPHub: blocked] syscall(")
		s = strings.ReplaceAll(s, "__asm__", "// [CPHub: blocked] __asm__")

	case LangPython3:
		s = strings.ReplaceAll(s, "compile(", "# [CPHub: blocked] compile(")
		s = strings.ReplaceAll(s, "exec(", "# [CPHub: blocked] exec(")
		s = strings.ReplaceAll(s, "eval(", "# [CPHub: blocked] eval(")

	case LangJava21:
		s = strings.ReplaceAll(s, "java.lang.reflect", "// [CPHub: blocked] reflect")
		s = strings.ReplaceAll(s, "sun.misc.Unsafe", "// [CPHub: blocked] Unsafe")

	case LangNodeJS:
		s = strings.ReplaceAll(s, "require('child_process')", "// [CPHub: blocked]")
		s = strings.ReplaceAll(s, "require(\"child_process\")", "// [CPHub: blocked]")
		s = strings.ReplaceAll(s, "fs.writeFileSync", "// [CPHub: blocked] fs.writeFileSync")
	}

	return s
}

// ValidateCodeSize checks if code exceeds max size
func ValidateCodeSize(source string, maxSizeKB int) error {
	sizeKB := len(source) / 1024
	if sizeKB > maxSizeKB {
		return fmt.Errorf("code size %d KB exceeds limit %d KB", sizeKB, maxSizeKB)
	}
	return nil
}

