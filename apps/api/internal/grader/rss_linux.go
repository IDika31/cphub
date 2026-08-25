//go:build linux

package grader

// Linux getrusage(2) reports ru_maxrss in kilobytes already.
func normalizeMaxRSS(v int64) int64 { return v }
