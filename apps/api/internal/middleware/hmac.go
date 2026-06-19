package middleware

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"time"

	"github.com/IDika31/cphub/api/internal/config"
	"github.com/IDika31/cphub/api/internal/database"
	"github.com/gofiber/fiber/v2"
)

func HMACVerify(cfg config.ExtensionConfig) fiber.Handler {
	return func(c *fiber.Ctx) error {
		signature := c.Get("X-HMAC-Signature")
		nonce := c.Get("X-Nonce")

		if signature == "" || nonce == "" {
			return c.Status(401).JSON(fiber.Map{"error": "Missing HMAC signature or nonce"})
		}

		// Check nonce replay (Redis)
		ctx := c.Context()
		key := "nonce:" + nonce
		exists, err := database.Cache.Exists(ctx, key).Result()
		if err == nil && exists > 0 {
			return c.Status(401).JSON(fiber.Map{"error": "Nonce already used"})
		}

		// Verify HMAC
		body := c.Body()
		mac := hmac.New(sha256.New, []byte(cfg.HMACSecret))
		mac.Write(body)
		expected := hex.EncodeToString(mac.Sum(nil))

		if !hmac.Equal([]byte(signature), []byte(expected)) {
			return c.Status(401).JSON(fiber.Map{"error": "Invalid HMAC signature"})
		}

		// Store nonce (5 min TTL)
		database.Cache.Set(ctx, key, "1", 5*time.Minute).Err()

		return c.Next()
	}
}
