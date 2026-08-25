package middleware

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"time"

	"github.com/IDika31/cphub/api/internal/database"
	"github.com/IDika31/cphub/api/internal/model"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// HMACVerify authenticates extension traffic with the caller's own key.
// X-Key-Id names the account, and the signature is HMAC-SHA256 of the raw body
// under that account's extension_secret — so one leaked key is scoped to one
// account. The resolved account is exposed as c.Locals("userId").
func HMACVerify(db *gorm.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		keyID := c.Get("X-Key-Id")
		signature := c.Get("X-HMAC-Signature")
		nonce := c.Get("X-Nonce")

		if keyID == "" || signature == "" || nonce == "" {
			return c.Status(401).JSON(fiber.Map{"error": "Missing X-Key-Id, HMAC signature or nonce"})
		}

		uid, err := uuid.Parse(keyID)
		if err != nil {
			return c.Status(401).JSON(fiber.Map{"error": "Invalid X-Key-Id"})
		}

		// Replay window, scoped per key so one account cannot burn another's nonces.
		ctx := c.Context()
		cacheKey := "nonce:" + keyID + ":" + nonce
		if exists, err := database.Cache.Exists(ctx, cacheKey).Result(); err == nil && exists > 0 {
			return c.Status(401).JSON(fiber.Map{"error": "Nonce already used"})
		}

		var user model.User
		if err := db.Select("id", "extension_secret").First(&user, "id = ?", uid).Error; err != nil {
			return c.Status(401).JSON(fiber.Map{"error": "Unknown extension key"})
		}
		if user.ExtensionSecret == "" {
			return c.Status(401).JSON(fiber.Map{"error": "Extension key not provisioned — open CPHub Settings"})
		}

		mac := hmac.New(sha256.New, []byte(user.ExtensionSecret))
		mac.Write(c.Body())
		expected := hex.EncodeToString(mac.Sum(nil))

		if !hmac.Equal([]byte(signature), []byte(expected)) {
			return c.Status(401).JSON(fiber.Map{"error": "Invalid HMAC signature"})
		}

		database.Cache.Set(ctx, cacheKey, "1", 5*time.Minute)
		c.Locals("userId", user.ID.String())

		return c.Next()
	}
}
