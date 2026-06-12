package grader

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/google/uuid"
)

const TempBaseDir = "/tmp/cphub-grader"

type TempDir struct {
	Path       string
	SourceFile string
	BinaryFile string
	TestDir    string
}

// CreateTempDir creates isolated temp directory for a grader run
func CreateTempDir(lang Language, sourceCode string) (*TempDir, error) {
	runID := uuid.New().String()
	cfg := lang.Config()

	dir := filepath.Join(TempBaseDir, runID)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return nil, fmt.Errorf("failed to create temp dir: %w", err)
	}

	testDir := filepath.Join(dir, "testcases")
	if err := os.MkdirAll(testDir, 0700); err != nil {
		os.RemoveAll(dir)
		return nil, fmt.Errorf("failed to create test dir: %w", err)
	}

	srcPath := filepath.Join(dir, cfg.SourceFile)
	if err := os.WriteFile(srcPath, []byte(sourceCode), 0600); err != nil {
		os.RemoveAll(dir)
		return nil, fmt.Errorf("failed to write source file: %w", err)
	}

	return &TempDir{
		Path:       dir,
		SourceFile: srcPath,
		BinaryFile: filepath.Join(dir, cfg.BinaryFile),
		TestDir:    testDir,
	}, nil
}

// WriteTestCases writes input/output files for each test case
func (td *TempDir) WriteTestCases(tests []TestCase) error {
	for i, tc := range tests {
		inFile := filepath.Join(td.TestDir, fmt.Sprintf("%d.in", i))
		outFile := filepath.Join(td.TestDir, fmt.Sprintf("%d.out", i))

		if err := os.WriteFile(inFile, []byte(tc.Input), 0600); err != nil {
			return fmt.Errorf("failed to write input %d: %w", i, err)
		}
		if err := os.WriteFile(outFile, []byte(tc.Output), 0600); err != nil {
			return fmt.Errorf("failed to write output %d: %w", i, err)
		}
	}
	return nil
}

// Cleanup removes the temp directory
func (td *TempDir) Cleanup() error {
	if td.Path != "" {
		return os.RemoveAll(td.Path)
	}
	return nil
}

type TestCase struct {
	Input  string
	Output string
}
