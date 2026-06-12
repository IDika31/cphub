package grader

import (
	"strings"
	"testing"
)

func TestSanitize_BlockedMarked(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		lang    Language
		check   string // this string should appear in the result
	}{
		{"fork_blocked", "int main() { fork(); }", LangCPP17, "[CPHub: blocked"},
		{"system_blocked", "int main() { std::system(\"rm\"); }", LangCPP17, "[CPHub: blocked"},
		{"execl_blocked", "int main() { execl(\"/bin/sh\"); }", LangCPP17, "[CPHub: blocked"},
		{"filesystem_blocked", "#include <filesystem>\nint main() {}", LangCPP17, "[CPHub: blocked"},
		{"os_system_blocked", "import os\nos.system('ls')", LangPython3, "[CPHub: blocked"},
		{"exec_blocked", "exec('print(1)')", LangPython3, "[CPHub: blocked"},
		{"runtime_exec_blocked", "Runtime.getRuntime().exec(\"ls\");", LangJava21, "[CPHub: blocked"},
		{"process_builder_blocked", "new ProcessBuilder(\"ls\");", LangJava21, "[CPHub: blocked"},
		{"child_process_blocked", "require('child_process')", LangNodeJS, "[CPHub: blocked"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := Sanitize(tt.input, tt.lang)
			if !strings.Contains(result, tt.check) {
				t.Errorf("expected %q to contain %q, got: %s", tt.name, tt.check, result)
			}
		})
	}
}

func TestSanitize_HarmlessPreserved(t *testing.T) {
	tests := []struct {
		name  string
		input string
		lang  Language
		keep  string
	}{
		{"iostream_ok", "#include <iostream>\nint main() { return 0; }", LangCPP17, "#include <iostream>"},
		{"print_ok", "print('Hello')", LangPython3, "print('Hello')"},
		{"console_ok", "console.log('ok')", LangNodeJS, "console.log('ok')"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := Sanitize(tt.input, tt.lang)
			if !strings.Contains(result, tt.keep) {
				t.Errorf("harmless code %q should keep %q, got: %s", tt.name, tt.keep, result)
			}
		})
	}
}

func TestValidateCodeSize(t *testing.T) {
	small := "int main() { return 0; }"
	if err := ValidateCodeSize(small, 256); err != nil {
		t.Errorf("small code should pass: %v", err)
	}

	large := strings.Repeat("x", 257*1024)
	if err := ValidateCodeSize(large, 256); err == nil {
		t.Error("oversized code should fail")
	}
}
