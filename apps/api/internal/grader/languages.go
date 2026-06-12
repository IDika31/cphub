package grader

import (
	"fmt"
	"strings"
)

type Language string

const (
	LangCPP17    Language = "cpp17"
	LangCPP20    Language = "cpp20"
	LangPython3  Language = "python3"
	LangJava21   Language = "java21"
	LangNodeJS   Language = "nodejs"
)

type LangConfig struct {
	Extension    string
	CompileCmd   string
	CompileArgs  []string
	RunCmd       string
	RunArgs      []string
	IsCompiled   bool
	SourceFile   string
	BinaryFile   string
}

var Languages = map[Language]LangConfig{
	LangCPP17: {
		Extension:   ".cpp",
		CompileCmd:  "/usr/bin/g++",
		CompileArgs: []string{"-std=c++17", "-O2", "-Wall", "-fsanitize=address,undefined", "-o", "solution", "source.cpp"},
		RunCmd:      "./solution",
		RunArgs:     []string{},
		IsCompiled:  true,
		SourceFile:  "source.cpp",
		BinaryFile:  "solution",
	},
	LangCPP20: {
		Extension:   ".cpp",
		CompileCmd:  "/usr/bin/g++",
		CompileArgs: []string{"-std=c++20", "-O2", "-Wall", "-fsanitize=address,undefined", "-o", "solution", "source.cpp"},
		RunCmd:      "./solution",
		RunArgs:     []string{},
		IsCompiled:  true,
		SourceFile:  "source.cpp",
		BinaryFile:  "solution",
	},
	LangPython3: {
		Extension:   ".py",
		CompileCmd:  "",
		CompileArgs: nil,
		RunCmd:      "/usr/bin/python3",
		RunArgs:     []string{"source.py"},
		IsCompiled:  false,
		SourceFile:  "source.py",
		BinaryFile:  "",
	},
	LangJava21: {
		Extension:   ".java",
		CompileCmd:  "/usr/bin/javac",
		CompileArgs: []string{"Solution.java"},
		RunCmd:      "/usr/bin/java",
		RunArgs:     []string{"Solution"},
		IsCompiled:  true,
		SourceFile:  "Solution.java",
		BinaryFile:  "",
	},
	LangNodeJS: {
		Extension:   ".js",
		CompileCmd:  "",
		CompileArgs: nil,
		RunCmd:      "/usr/bin/node",
		RunArgs:     []string{"source.js"},
		IsCompiled:  false,
		SourceFile:  "source.js",
		BinaryFile:  "",
	},
}

func (l Language) Valid() bool {
	_, ok := Languages[l]
	return ok
}

func (l Language) Config() LangConfig {
	return Languages[l]
}

func (l Language) Extension() string {
	if cfg, ok := Languages[l]; ok {
		return cfg.Extension
	}
	return ".txt"
}

// Verdict constants
type Verdict string

const (
	VerdictAC      Verdict = "AC"
	VerdictWA      Verdict = "WA"
	VerdictTLE     Verdict = "TLE"
	VerdictRE      Verdict = "RE"
	VerdictCE      Verdict = "CE"
	VerdictPending Verdict = "PENDING"
	VerdictError   Verdict = "ERROR"
)

type TestResult struct {
	Index     int     `json:"index"`
	Verdict   Verdict `json:"verdict"`
	Runtime   int64   `json:"runtime"`
	Memory    int64   `json:"memory"`
	Input     string  `json:"input"`
	Expected  string  `json:"expected"`
	Output    string  `json:"output"`
	Error     string  `json:"error,omitempty"`
}

type GraderResult struct {
	Verdict     Verdict      `json:"verdict"`
	TotalTests  int          `json:"totalTests"`
	PassedTests int          `json:"passedTests"`
	MaxRuntime  int64        `json:"maxRuntime"`
	MaxMemory   int64        `json:"maxMemory"`
	Results     []TestResult `json:"results"`
	CompileError string      `json:"compileError,omitempty"`
}

// Normalize output for comparison: trim whitespace and trailing newlines
func NormalizeOutput(s string) string {
	return strings.TrimSpace(strings.TrimRight(s, "\r\n"))
}

// Compare outputs token-by-token
func CompareOutput(expected, actual string) bool {
	expTokens := strings.Fields(NormalizeOutput(expected))
	actTokens := strings.Fields(NormalizeOutput(actual))
	if len(expTokens) != len(actTokens) {
		return false
	}
	for i := range expTokens {
		if expTokens[i] != actTokens[i] {
			return false
		}
	}
	return true
}

// Aggregate verdict — AC only if ALL pass
func AggregateVerdict(results []TestResult) Verdict {
	if len(results) == 0 {
		return VerdictError
	}
	for _, r := range results {
		if r.Verdict != VerdictAC {
			return r.Verdict
		}
	}
	return VerdictAC
}

// Format compile error for user display
func FormatCompileError(stderr string) string {
	// Strip temp dir paths for cleaner output
	s := strings.ReplaceAll(stderr, "/tmp/cphub-", "$TMPDIR/")
	return fmt.Sprintf("Compilation Error:\n%s", s)
}
