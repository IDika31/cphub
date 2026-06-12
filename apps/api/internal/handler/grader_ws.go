package handler

import (
	"encoding/json"
	"log"

	"github.com/gofiber/contrib/websocket"
	"github.com/gofiber/fiber/v2"
)

func (h *GraderHandler) WebSocket(c *fiber.Ctx) error {
	if websocket.IsWebSocketUpgrade(c) {
		return c.Next()
	}
	return c.Status(426).JSON(fiber.Map{"error": "WebSocket upgrade required"})
}

func (h *GraderHandler) HandleWS(c *websocket.Conn) {
	defer c.Close()

	log.Println("[ws] grader client connected")
	c.WriteJSON(fiber.Map{"type": "connected", "message": "Grader WebSocket connected"})

	for {
		_, msg, err := c.ReadMessage()
		if err != nil {
			log.Printf("[ws] client disconnected: %v", err)
			break
		}

		var req struct {
			Type    string `json:"type"`
			RunID   string `json:"runId"`
		}
		if err := json.Unmarshal(msg, &req); err != nil {
			continue
		}

		switch req.Type {
		case "ping":
			c.WriteJSON(fiber.Map{"type": "pong"})
		case "subscribe":
			// Subscribe to grader result for runId
			c.WriteJSON(fiber.Map{"type": "subscribed", "runId": req.RunID})
		default:
			c.WriteJSON(fiber.Map{"type": "error", "message": "Unknown message type"})
		}
	}
}
