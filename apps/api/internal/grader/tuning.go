package grader

import (
	"log"
	"sync/atomic"
	"time"
)

// Timing knobs. The wall-clock kill happens at
//
//	time limit + sandbox overhead + grace
//
// while the TLE verdict is still decided by the time limit alone. Sandbox
// startup is real and machine-dependent (tens of ms on a laptop, hundreds on a
// small VPS), so it is measured at startup instead of guessed — otherwise a
// solution that fits the limit gets killed by the wrapper's own cost.
var (
	graceMS    atomic.Int64
	overheadMS atomic.Int64
)

func init() { graceMS.Store(500) }

// TimeGrace is the slack added on top of the limit before the hard kill.
func TimeGrace() time.Duration {
	return time.Duration(graceMS.Load()) * time.Millisecond
}

// SandboxOverhead is the measured cost of starting and tearing down the sandbox.
func SandboxOverhead() time.Duration {
	return time.Duration(overheadMS.Load()) * time.Millisecond
}

// SetTuning applies configuration. A positive overheadOverrideMS pins the value
// (useful when autodetect misfires on a noisy host); otherwise it is measured.
func SetTuning(graceOverrideMS, overheadOverrideMS int) {
	if graceOverrideMS > 0 {
		graceMS.Store(int64(graceOverrideMS))
	}
	if overheadOverrideMS > 0 {
		overheadMS.Store(int64(overheadOverrideMS))
		log.Printf("[grader] sandbox overhead pinned at %dms, grace %dms", overheadOverrideMS, graceMS.Load())
		return
	}
	measureSandboxOverhead()
	log.Printf("[grader] sandbox overhead %dms, grace %dms", overheadMS.Load(), graceMS.Load())
}
