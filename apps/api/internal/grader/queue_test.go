package grader

import (
	"testing"
)

func TestQueue_AcquireRelease(t *testing.T) {
	q := NewQueue(3)

	// Acquire 3 slots
	r1, err1 := q.Acquire()
	r2, err2 := q.Acquire()
	r3, err3 := q.Acquire()

	if err1 != nil || err2 != nil || err3 != nil {
		t.Fatal("should acquire 3 slots successfully")
	}

	// 4th should fail
	_, err4 := q.Acquire()
	if err4 == nil {
		t.Error("4th acquire should fail (max 3)")
	}

	// Release one
	r1()

	// Now should succeed
	r4, err5 := q.Acquire()
	if err5 != nil {
		t.Errorf("should acquire after release, got: %v", err5)
	}

	r2()
	r3()
	r4()

	active, max := q.Status()
	if active != 0 {
		t.Errorf("active should be 0 after all released, got %d", active)
	}
	if max != 3 {
		t.Errorf("max should be 3, got %d", max)
	}
}

func TestNewQueue_Default(t *testing.T) {
	q := NewQueue(5)
	active, max := q.Status()
	if active != 0 {
		t.Errorf("initial active should be 0, got %d", active)
	}
	if max != 5 {
		t.Errorf("max should be 5, got %d", max)
	}
}
