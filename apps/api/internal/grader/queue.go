package grader

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/IDika31/cphub/api/internal/database"
)

type Queue struct {
	mu          sync.Mutex
	activeCount int
	maxConcurrent int
	waiting     int
}

func NewQueue(maxConcurrent int) *Queue {
	return &Queue{maxConcurrent: maxConcurrent}
}

func (q *Queue) Acquire() (func(), error) {
	q.mu.Lock()
	defer q.mu.Unlock()

	if q.activeCount >= q.maxConcurrent {
		return nil, fmt.Errorf("GRADER_QUEUE_FULL: %d/%d active, try again later", q.activeCount, q.maxConcurrent)
	}

	q.activeCount++
	return func() {
		q.mu.Lock()
		q.activeCount--
		q.mu.Unlock()
	}, nil
}

func (q *Queue) Status() (active, max int) {
	q.mu.Lock()
	defer q.mu.Unlock()
	return q.activeCount, q.maxConcurrent
}

func (q *Queue) Enqueue(ctx context.Context, runID string) error {
	return database.Cache.LPush(ctx, "grader:queue", runID).Err()
}

func (q *Queue) Dequeue(ctx context.Context) (string, error) {
	result, err := database.Cache.BRPop(ctx, 0, "grader:queue").Result()
	if err != nil {
		return "", err
	}
	if len(result) < 2 {
		return "", fmt.Errorf("invalid queue pop result")
	}
	return result[1], nil
}

func (q *Queue) QueueLength(ctx context.Context) int64 {
	return database.Cache.LLen(ctx, "grader:queue").Val()
}

// WaitForSlot blocks until a slot is available
func (q *Queue) WaitForSlot(ctx context.Context) error {
	for {
		release, err := q.Acquire()
		if err == nil {
			release()
			return nil
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(100 * time.Millisecond):
			continue
		}
	}
}

var defaultQueue *Queue

func InitQueue(maxConcurrent int) {
	defaultQueue = NewQueue(maxConcurrent)
	log.Printf("[grader] queue initialized (max concurrent: %d)", maxConcurrent)
}

func GetQueue() *Queue {
	return defaultQueue
}
