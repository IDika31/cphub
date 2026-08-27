package handler

import (
	"log"
	"time"

	"github.com/IDika31/cphub/api/internal/model"
	"github.com/IDika31/cphub/api/internal/provider/codeforces"
	"github.com/IDika31/cphub/api/internal/secret"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// CFWebHandler owns everything Codeforces has no API for: signing in, submitting
// and registering. Reads stay on the official API (see CFSyncHandler); only these
// three actions need a browser session. Preferred path is the extension, which acts
// in the user's own browser (see SessionFromExtension); this handler is the fallback.
type CFWebHandler struct {
	db  *gorm.DB
	api *codeforces.API
	box *secret.Box
}

func NewCFWebHandler(db *gorm.DB, apiKey, apiSecret, credKey string) *CFWebHandler {
	box, err := secret.NewBox(credKey)
	if err != nil {
		// Not fatal: without a key the feature still works, it just cannot keep a
		// password for unattended re-login.
		log.Printf("[cf-web] password storage disabled: %v", err)
		box = nil
	}
	return &CFWebHandler{db: db, api: codeforces.NewAPI(apiKey, apiSecret), box: box}
}

// Login links a Codeforces account with handle and password. This is now the
// primary path: Codeforces publishes no OAuth of its own, so the existing OAuth
// flow is optional and this one is what makes submitting possible.
func (h *CFWebHandler) Login(c *fiber.Ctx) error {
	uid, err := uuid.Parse(c.Locals("userId").(string))
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "Unauthenticated"})
	}
	var in struct {
		Handle       string `json:"handle"`
		Password     string `json:"password"`
		SavePassword bool   `json:"savePassword"`
	}
	if err := c.BodyParser(&in); err != nil || in.Handle == "" || in.Password == "" {
		return c.Status(400).JSON(fiber.Map{"error": "handle dan password wajib diisi"})
	}

	session, err := codeforces.NewWebSession()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Gagal menyiapkan sesi"})
	}
	handle, err := session.Login(in.Handle, in.Password)
	if err != nil {
		log.Printf("[cf-web] login failed for %s: %v", in.Handle, err)
		// 401, not 502: this deployment sits behind Cloudflare, which replaces an
		// origin 5xx body with its own "Bad gateway" page, so the reason for the
		// failure never reaches the browser. Every Codeforces-side refusal in this
		// file therefore answers in the 4xx range, where the JSON survives.
		return c.Status(401).JSON(fiber.Map{"error": err.Error()})
	}

	blob, err := session.Export()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Gagal menyimpan sesi Codeforces"})
	}

	passwordEnc := ""
	warning := ""
	if in.SavePassword {
		if h.box == nil {
			warning = "Password tidak disimpan: CRED_ENC_KEY belum diset di server. Sesi tetap dipakai sampai kedaluwarsa."
		} else if sealed, sErr := h.box.Seal(in.Password); sErr != nil {
			warning = "Password tidak disimpan: " + sErr.Error()
		} else {
			passwordEnc = sealed
		}
	}

	now := time.Now()
	account := model.LinkedAccount{
		UserID:           uid,
		Provider:         "codeforces",
		ProviderUserID:   handle,
		Handle:           handle,
		ProviderUsername: handle,
		SessionData:      string(blob),
		PasswordEnc:      passwordEnc,
		SessionCheckedAt: &now,
		IsConnected:      true,
		LinkedAt:         now,
	}
	// Rating comes from the API, which needs no session at all.
	if info, iErr := codeforces.NewClient("", "").GetUserInfo(handle); iErr == nil {
		account.Rating, account.MaxRating, account.AvatarURL = info.Rating, info.MaxRating, info.Avatar
	}

	assign := map[string]interface{}{
		"provider_user_id":   handle,
		// handle is in here for a reason: it is what cfSession re-logs in with and what
		// the verdict poll asks user.status about, so leaving it out meant relinking a
		// DIFFERENT Codeforces account updated every other column and kept the old
		// handle — and every later action then acted as the previous account.
		"handle":             handle,
		"provider_username":  handle,
		"session_data":       string(blob),
		"session_checked_at": &now,
		"is_connected":       true,
		"rating":             account.Rating,
		"max_rating":         account.MaxRating,
	}
	// An empty password must not wipe one saved earlier by an opt-in login.
	if passwordEnc != "" {
		assign["password_enc"] = passwordEnc
	}
	if err := h.db.Where("user_id = ? AND provider = ?", uid, "codeforces").
		Assign(assign).FirstOrCreate(&account).Error; err != nil {
		log.Printf("[cf-web] failed to save account: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "Gagal menyimpan akun Codeforces"})
	}

	log.Printf("[cf-web] linked %s (user=%s, password stored=%t)", handle, uid, passwordEnc != "")
	return c.JSON(fiber.Map{
		"handle":  handle,
		"rating":  account.Rating,
		"mirror":  session.Host(),
		"warning": warning,
	})
}
