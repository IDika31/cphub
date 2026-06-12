package handler

import (
	"github.com/gofiber/fiber/v2"
)

// GoogleCallback handles the OAuth2 callback from Google
func (h *AuthHandler) GoogleCallbackDetailed(c *fiber.Ctx) error {
	code := c.Query("code")
	if code == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Missing authorization code"})
	}

	// Exchange code for token (production: call Google OAuth2 API)
	// For local dev, accept id_token from client-side Google Sign-In
	idToken := c.Query("id_token")
	if idToken == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Missing id_token"})
	}

	// Verify id_token with Google (production: call tokeninfo endpoint)
	// Simplified: extract claims
	email := c.Query("email", "")
	name := c.Query("name", "")
	googleID := c.Query("sub", c.Query("google_id", ""))

	if email == "" || googleID == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Incomplete Google profile data"})
	}

	resp, err := h.svc.GoogleAuth(googleID, email, name, c.Query("picture", ""))
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(resp)
}
