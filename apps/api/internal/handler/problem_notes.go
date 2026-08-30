package handler

import (
	"log"
	"strings"
	"time"

	"github.com/IDika31/cphub/api/internal/model"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// maxNoteBody caps a note. Generous for prose — a few pages — and small enough that the
// column cannot become a file upload by accident.
const maxNoteBody = 16 * 1024

// ProblemNotesHandler owns the one thing on a problem page that belongs to the reader
// rather than to the problem: what they wrote down about it.
//
// Its own handler and its own table because problems are a shared library with no owner.
// Everything else on that page is the same for everyone; this is not.
type ProblemNotesHandler struct {
	db *gorm.DB
}

func NewProblemNotesHandler(db *gorm.DB) *ProblemNotesHandler {
	return &ProblemNotesHandler{db: db}
}

// problemKey resolves whatever the page has in hand — the row's UUID or the provider's
// own ref like "4A" — to the primary key notes are stored against. The page knows both,
// and which one it knows first depends on how the user arrived.
func (h *ProblemNotesHandler) problemKey(raw string) (uuid.UUID, bool) {
	id := strings.TrimSpace(raw)
	if id == "" {
		return uuid.Nil, false
	}
	if parsed, err := uuid.Parse(id); err == nil {
		return parsed, true
	}
	var problem model.Problem
	if err := h.db.Select("id").Where("problem_id = ?", id).First(&problem).Error; err != nil {
		return uuid.Nil, false
	}
	return problem.ID, true
}

// GetNote returns this user's note, or an empty one. Absent is not an error: the editor
// opens on every problem, and 404 for "nothing written yet" would make the page handle a
// failure that is really the normal case.
func (h *ProblemNotesHandler) GetNote(c *fiber.Ctx) error {
	userID, err := uuid.Parse(c.Locals("userId").(string))
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "Unauthenticated"})
	}
	problemID, ok := h.problemKey(c.Params("id"))
	if !ok {
		return c.Status(404).JSON(fiber.Map{"error": "Problem tidak ditemukan"})
	}

	var note model.ProblemNote
	err = h.db.Where("user_id = ? AND problem_id = ?", userID, problemID).First(&note).Error
	if err != nil {
		return c.JSON(fiber.Map{"body": "", "updatedAt": nil})
	}
	return c.JSON(fiber.Map{"body": note.Body, "updatedAt": note.UpdatedAt.UTC().Format(time.RFC3339)})
}

// SaveNote upserts the note. An empty body deletes it rather than storing a blank row,
// so "everything I have written down" stays a list of things actually written.
func (h *ProblemNotesHandler) SaveNote(c *fiber.Ctx) error {
	userID, err := uuid.Parse(c.Locals("userId").(string))
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "Unauthenticated"})
	}
	problemID, ok := h.problemKey(c.Params("id"))
	if !ok {
		return c.Status(404).JSON(fiber.Map{"error": "Problem tidak ditemukan"})
	}
	var in struct {
		Body string `json:"body"`
	}
	if err := c.BodyParser(&in); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Body tidak bisa dibaca"})
	}
	body := strings.TrimSpace(in.Body)
	if len(body) > maxNoteBody {
		return c.Status(fiber.StatusRequestEntityTooLarge).
			JSON(fiber.Map{"error": "Catatan terlalu panjang"})
	}

	if body == "" {
		if err := h.db.Where("user_id = ? AND problem_id = ?", userID, problemID).
			Delete(&model.ProblemNote{}).Error; err != nil {
			log.Printf("[notes] clearing note: %v", err)
			return c.Status(500).JSON(fiber.Map{"error": "Gagal menghapus catatan"})
		}
		return c.JSON(fiber.Map{"body": "", "updatedAt": nil})
	}

	now := time.Now()
	note := model.ProblemNote{UserID: userID, ProblemID: problemID, Body: body}
	// Assign, not FirstOrCreate alone: the second save of a note has to overwrite the
	// first, and updated_at is what the page prints back.
	if err := h.db.Where("user_id = ? AND problem_id = ?", userID, problemID).
		Assign(map[string]interface{}{"body": body, "updated_at": now}).
		FirstOrCreate(&note).Error; err != nil {
		log.Printf("[notes] saving note: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "Gagal menyimpan catatan"})
	}
	return c.JSON(fiber.Map{"body": body, "updatedAt": now.UTC().Format(time.RFC3339)})
}
