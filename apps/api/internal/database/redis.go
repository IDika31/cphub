package database

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/IDika31/cphub/api/internal/config"
	"github.com/go-redis/redis/v8"
)

var Cache *redis.Client

func ConnectRedis(cfg config.RedisConfig) (*redis.Client, error) {
	rdb := redis.NewClient(&redis.Options{
		Addr:     cfg.Addr(),
		Password: cfg.Password,
		DB:       cfg.DB,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := rdb.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("failed to connect to Redis: %w", err)
	}

	Cache = rdb
	log.Println("[database] connected to Redis")
	return rdb, nil
}

func HealthCheckRedis() error {
	if Cache == nil {
		return fmt.Errorf("redis not connected")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	return Cache.Ping(ctx).Err()
}

func CloseRedis() error {
	if Cache == nil {
		return nil
	}
	return Cache.Close()
}
