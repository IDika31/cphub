package handler

import (
	"github.com/IDika31/cphub/api/internal/service"
	"github.com/gofiber/fiber/v2"
)

type AuthHandler struct {
	svc *service.AuthService
}

func NewAuthHandler(svc *service.AuthService) *AuthHandler {
	return &AuthHandler{svc: svc}
}

func (h *AuthHandler) Register(c *fiber.Ctx) error {
	var input service.RegisterInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request body"})
	}
	if input.Email == "" || input.Password == "" || input.Name == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Name, email, and password are required"})
	}
	if len(input.Password) < 8 {
		return c.Status(400).JSON(fiber.Map{"error": "Password must be at least 8 characters"})
	}

	resp, err := h.svc.Register(input)
	if err != nil {
		return c.Status(409).JSON(fiber.Map{"error": err.Error()})
	}

	return c.Status(201).JSON(resp)
}

func (h *AuthHandler) Login(c *fiber.Ctx) error {
	var input service.LoginInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request body"})
	}
	if input.Email == "" || input.Password == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Email and password are required"})
	}

	resp, err := h.svc.Login(input)
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(resp)
}

func (h *AuthHandler) GoogleCallback(c *fiber.Ctx) error {
	// In production, exchange code for token, then get user info
	// For now, accept mock user data from query params
	googleID := c.Query("google_id")
	email := c.Query("email")
	name := c.Query("name")
	avatarURL := c.Query("avatar_url")

	if googleID == "" || email == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Missing required Google OAuth data"})
	}

	resp, err := h.svc.GoogleAuth(googleID, email, name, avatarURL)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(resp)
}

func (h *AuthHandler) GoogleLogin(c *fiber.Ctx) error {
	// Redirect to Google OAuth consent screen
	// This is a simplified redirect — real implementation uses OAuth2 config
	redirectURL := "https://accounts.google.com/o/oauth2/v2/auth" +
		"?client_id=" + c.Query("client_id") +
		"&redirect_uri=" + c.Query("redirect_uri", "http://localhost:3001/api/auth/google/callback") +
		"&response_type=code" +
		"&scope=openid%20email%20profile"

	return c.Redirect(redirectURL, 302)
}

func (h *AuthHandler) Me(c *fiber.Ctx) error {
	userID := c.Locals("userId")
	if userID == nil {
		return c.Status(401).JSON(fiber.Map{"error": "Not authenticated"})
	}
	return c.JSON(fiber.Map{"userId": userID, "email": c.Locals("email")})
}

func (h *AuthHandler) Logout(c *fiber.Ctx) error {
	// In a stateless JWT setup, client handles token removal
	// Server-side: could blacklist token in Redis
	return c.JSON(fiber.Map{"message": "Logged out"})
}
