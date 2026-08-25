//go:build !windows && !linux

package grader

// BSD and darwin report ru_maxrss in bytes.
func normalizeMaxRSS(v int64) int64 { return v / 1024 }
