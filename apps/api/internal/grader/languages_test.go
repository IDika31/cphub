package grader

import (
	"testing"
)

func TestLanguageValid(t *testing.T) {
	if !LangCPP17.Valid() {
		t.Error("cpp17 should be valid")
	}
	if !LangPython3.Valid() {
		t.Error("python3 should be valid")
	}
	if !LangJava21.Valid() {
		t.Error("java21 should be valid")
	}
	if !LangNodeJS.Valid() {
		t.Error("nodejs should be valid")
	}
	if Language("invalid").Valid() {
		t.Error("invalid language should not be valid")
	}
}

func TestLanguageConfig_Compiled(t *testing.T) {
	if cfg := LangCPP17.Config(); !cfg.IsCompiled {
		t.Error("cpp17 should be compiled")
	}
	if cfg := LangPython3.Config(); cfg.IsCompiled {
		t.Error("python3 should not be compiled")
	}
	if cfg := LangNodeJS.Config(); cfg.IsCompiled {
		t.Error("nodejs should not be compiled")
	}
}

func TestNormalizeOutput(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"hello\n", "hello"},
		{"  hello  ", "hello"},
		{"hello\r\n", "hello"},
		{"hello\nworld\n", "hello\nworld"},
		{"", ""},
	}

	for _, tt := range tests {
		result := NormalizeOutput(tt.input)
		if result != tt.expected {
			t.Errorf("NormalizeOutput(%q) = %q, want %q", tt.input, result, tt.expected)
		}
	}
}

func TestCompareOutput(t *testing.T) {
	tests := []struct {
		expected string
		actual   string
		match    bool
	}{
		{"3", "3", true},
		{"3\n", "3", true},
		{"3\r\n", "3\n", true},
		{" 3 ", "3", true},
		{"hello world", "hello world", true},
		{"3", "4", false},
		{"hello", "world", false},
		{"1 2", "1  2", true}, // same tokens
		{"1 2", "1 3", false},
	}

	for _, tt := range tests {
		result := CompareOutput(tt.expected, tt.actual)
		if result != tt.match {
			t.Errorf("CompareOutput(%q, %q) = %v, want %v", tt.expected, tt.actual, result, tt.match)
		}
	}
}

func TestAggregateVerdict(t *testing.T) {
	allAC := []TestResult{
		{Verdict: VerdictAC}, {Verdict: VerdictAC}, {Verdict: VerdictAC},
	}
	if v := AggregateVerdict(allAC); v != VerdictAC {
		t.Errorf("all AC should aggregate to AC, got %s", v)
	}

	hasWA := []TestResult{
		{Verdict: VerdictAC}, {Verdict: VerdictWA}, {Verdict: VerdictAC},
	}
	if v := AggregateVerdict(hasWA); v != VerdictWA {
		t.Errorf("first non-AC should be WA, got %s", v)
	}

	hasTLE := []TestResult{
		{Verdict: VerdictAC}, {Verdict: VerdictTLE},
	}
	if v := AggregateVerdict(hasTLE); v != VerdictTLE {
		t.Errorf("should be TLE, got %s", v)
	}

	empty := []TestResult{}
	if v := AggregateVerdict(empty); v != VerdictError {
		t.Errorf("empty results should be ERROR, got %s", v)
	}
}
