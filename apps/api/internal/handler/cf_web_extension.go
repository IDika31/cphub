package handler

import (
	"encoding/json"
	"log"
	"strings"
	"time"

	"github.com/IDika31/cphub/api/internal/model"
	"github.com/IDika31/cphub/api/internal/provider/codeforces"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

// ErrCodeCFSessionExpired is the machine-readable half of "log in again". The web app
// keys the extension re-login prompt off this rather than off the prose, which is
// Indonesian and meant for humans.
const ErrCodeCFSessionExpired = "cf_session_expired"

// SessionFromExtension takes a Codeforces session captured in the user's own browser.
//
// This replaces handle+password login. The user authenticates on codeforces.com's own
// page — so CPHub never sees the password, and 2FA or a Cloudflare interactive prompt
// is simply the user's normal login — and the extension forwards the resulting
// identity cookies here.
//
// Two things deliberately do not arrive: the password, and cf_clearance. Cloudflare
// binds clearance to the IP that earned it, so the browser's copy is useless to this
// server; it earns its own with the headless solver when it has to act alone.
//
// Authenticated by HMACVerify (the /api/sync group), so the caller is the paired
// extension of exactly one account.
func (h *CFWebHandler) SessionFromExtension(c *fiber.Ctx) error {
	uid, err := uuid.Parse(c.Locals("userId").(string))
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "Unauthenticated"})
	}

	var in struct {
		Handle  string            `json:"handle"`
		Cookies []ExtensionCookie `json:"cookies"`
		Ftaa    string            `json:"ftaa"`
		Bfaa    string            `json:"bfaa"`
	}
	if err := c.BodyParser(&in); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Body tidak bisa dibaca"})
	}
	in.Handle = strings.TrimSpace(in.Handle)
	if in.Handle == "" {
		return c.Status(400).JSON(fiber.Map{"error": "handle wajib diisi"})
	}
	if len(in.Cookies) == 0 {
		return c.Status(400).JSON(fiber.Map{"error": "tidak ada cookie Codeforces yang dikirim"})
	}

	auth := cfAuthFromExtension(in.Handle, in.Ftaa, in.Bfaa, in.Cookies)
	if len(auth.Cookies) == 0 {
		return c.Status(400).JSON(fiber.Map{"error": "cookie yang dikirim tidak ada yang bisa dipakai"})
	}
	blob, err := json.Marshal(auth)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Gagal menyiapkan sesi"})
	}

	now := time.Now()
	account := model.LinkedAccount{
		UserID:           uid,
		Provider:         "codeforces",
		ProviderUserID:   in.Handle,
		Handle:           in.Handle,
		ProviderUsername: in.Handle,
		SessionData:      string(blob),
		SessionCheckedAt: &now,
		IsConnected:      true,
		LinkedAt:         now,
	}
	// Rating comes from the official API, which needs no session and is not walled.
	// It also doubles as a spelling check on the handle.
	if info, iErr := codeforces.NewClient("", "").GetUserInfo(in.Handle); iErr == nil {
		account.Rating, account.MaxRating, account.AvatarURL = info.Rating, info.MaxRating, info.Avatar
	} else {
		log.Printf("[cf-ext] rating lookup failed for %s: %v", in.Handle, iErr)
	}

	assign := map[string]interface{}{
		"provider_user_id":   in.Handle,
		"handle":             in.Handle,
		"provider_username":  in.Handle,
		"session_data":       string(blob),
		"session_checked_at": &now,
		"is_connected":       true,
		"rating":             account.Rating,
		"max_rating":         account.MaxRating,
		// Any password saved by the old flow is dropped here. It is dead weight now
		// that re-login is a browser prompt, and a stored credential nothing reads is
		// only a liability.
		"password_enc": "",
	}
	if err := h.db.Where("user_id = ? AND provider = ?", uid, "codeforces").
		Assign(assign).FirstOrCreate(&account).Error; err != nil {
		log.Printf("[cf-ext] failed to save account: %v", err)
		return c.Status(500).JSON(fiber.Map{"error": "Gagal menyimpan akun Codeforces"})
	}

	log.Printf("[cf-ext] linked %s from browser session (user=%s, %d cookies)", in.Handle, uid, len(auth.Cookies))
	return c.JSON(fiber.Map{"handle": in.Handle, "rating": account.Rating})
}

// ExtensionCookie is one cookie as the extension reports it.
type ExtensionCookie struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

// cfAuthFromExtension turns the extension's report into the session blob the
// Codeforces provider already knows how to restore, dropping what the server must
// not keep.
//
// cf_clearance is dropped rather than stored: Cloudflare binds it to the IP that
// earned it, so a copy from the user's browser cannot work here, and keeping one
// would make a dead session look like a live one. The extension already filters it,
// so this is the second of two independent checks on the same rule — the server does
// not get to trust its client on what it stores.
func cfAuthFromExtension(handle, ftaa, bfaa string, cookies []ExtensionCookie) codeforces.WebAuth {
	auth := codeforces.WebAuth{Handle: handle, Ftaa: ftaa, Bfaa: bfaa}
	for _, ck := range cookies {
		if ck.Name == "" || ck.Value == "" || ck.Name == "cf_clearance" {
			continue
		}
		auth.Cookies = append(auth.Cookies, codeforces.StoredCookie{Name: ck.Name, Value: ck.Value})
	}
	return auth
}

// ObserveSubmit finishes a submit the extension already made in the user's browser.
//
// The split is deliberate: the Codeforces request itself belongs in the browser (the
// session and the Cloudflare clearance are both already valid there), while the
// verdict and CPHub's own history belong here — user.status is on codeforces.com/api,
// which is not behind Cloudflare and needs no session at all.
//
// It takes the newest submission for the problem rather than an id, because the
// extension posts a form and reads a page rather than an API that returns one. Polled
// immediately after our own submit, the newest is ours; a submission the user made
// elsewhere seconds earlier would be misattributed, which is the accepted cost of not
// scraping an id out of the reply page.
func (h *CFWebHandler) ObserveSubmit(c *fiber.Ctx) error {
	uid, err := uuid.Parse(c.Locals("userId").(string))
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "Unauthenticated"})
	}
	var in struct {
		ProblemID string `json:"problemId"`
		Language  string `json:"language"`
	}
	if err := c.BodyParser(&in); err != nil || in.ProblemID == "" {
		return c.Status(400).JSON(fiber.Map{"error": "problemId wajib diisi"})
	}

	problem, contestID, _, pErr := h.resolveCFProblem(in.ProblemID)
	if pErr != nil {
		return pErr.send(c)
	}

	// The handle is all that is needed, and it is on the linked account — no browser
	// session, and therefore no Cloudflare solve, is involved in this call.
	var account model.LinkedAccount
	if err := h.db.Where("user_id = ? AND provider = ?", uid, "codeforces").First(&account).Error; err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "akun Codeforces belum dihubungkan"})
	}

	verdict, subID, runtime, memory := h.pollVerdict(account.Handle, problem.ProblemID, 0)
	if subID == 0 {
		return c.Status(fiber.StatusFailedDependency).JSON(fiber.Map{
			"error": "submit terkirim tapi belum terlihat di Codeforces — cek halaman submissions kamu",
		})
	}
	h.recordCFSubmission(uid, problem, in.Language, verdict, subID, runtime, memory)
	log.Printf("[cf-ext] %s submitted %s from browser → %s (id=%d)", account.Handle, problem.ProblemID, verdict, subID)
	return c.JSON(cfSubmitReply(contestID, verdict, subID, runtime))
}
