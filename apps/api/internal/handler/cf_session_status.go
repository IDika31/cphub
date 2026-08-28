package handler

import (
	"log"
	"time"

	"github.com/IDika31/cphub/api/internal/model"
	"github.com/IDika31/cphub/api/internal/provider/codeforces"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

// SessionStatus answers "does this user still have a working Codeforces session".
//
// It is a DB read by default, because the sidebar asks it on every navigation and a
// real check means a request to codeforces.com — which, for a server, can mean a
// Chromium launch. The stored answer is kept honest from the other side instead:
// markSessionExpired flips is_connected the moment any action gets a refusal from
// Codeforces, and SessionFromExtension flips it back.
//
// ?probe=1 forces the real check. That is the verification page's "Cek ulang"
// button, i.e. a user waiting for an answer, which is the only place worth spending
// a round trip (and possibly a clearance solve) on.
func (h *CFWebHandler) SessionStatus(c *fiber.Ctx) error {
	uid, err := uuid.Parse(c.Locals("userId").(string))
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "Unauthenticated"})
	}

	var account model.LinkedAccount
	if err := h.db.Where("user_id = ? AND provider = ?", uid, "codeforces").First(&account).Error; err != nil {
		// Not linked at all is a state, not a failure: the verification page offers
		// to connect, and the sidebar entry stays hidden for someone who does not
		// use Codeforces.
		return c.JSON(fiber.Map{"linked": false, "valid": false, "reason": "not_linked"})
	}

	reply := fiber.Map{
		"linked": true,
		"handle": account.Handle,
		"valid":  account.IsConnected && account.SessionData != "",
	}
	if account.SessionCheckedAt != nil {
		reply["checkedAt"] = account.SessionCheckedAt.UTC().Format(time.RFC3339)
	}
	if account.SessionData == "" {
		reply["reason"] = "no_session"
	} else if !account.IsConnected {
		reply["reason"] = "expired"
	}

	if !c.QueryBool("probe", false) {
		return c.JSON(reply)
	}

	// The real check. Anything but a live session comes back as valid:false with the
	// reason, never as an error — the page's job is to tell the user which of the two
	// it is, and a 502 here would read as "CPHub is broken".
	if account.SessionData == "" {
		return c.JSON(reply)
	}
	session, sErr := codeforces.NewWebSession()
	if sErr != nil {
		log.Printf("[cf-web] probe could not build a session: %v", sErr)
		reply["reason"] = "probe_failed"
		reply["detail"] = sErr.Error()
		return c.JSON(reply)
	}
	if iErr := session.Import([]byte(account.SessionData)); iErr != nil {
		log.Printf("[cf-web] probe import failed: %v", iErr)
	}
	who, cErr := session.LoggedInHandle()
	now := time.Now()
	switch {
	case cErr != nil:
		// Codeforces was unreachable — a Cloudflare wall, a timeout. The session may
		// well be fine, so the stored verdict is left alone rather than marking a
		// good session dead.
		log.Printf("[cf-web] probe for %s could not reach Codeforces: %v", account.Handle, cErr)
		reply["reason"] = "unreachable"
		reply["detail"] = cErr.Error()
	case who == "":
		h.markSessionExpired(uid)
		reply["valid"] = false
		reply["reason"] = "expired"
	default:
		h.db.Model(&model.LinkedAccount{}).Where("id = ?", account.ID).
			Updates(map[string]interface{}{"is_connected": true, "session_checked_at": &now})
		reply["valid"] = true
		reply["handle"] = who
		reply["checkedAt"] = now.UTC().Format(time.RFC3339)
		delete(reply, "reason")
	}
	return c.JSON(reply)
}

// markSessionExpired records that Codeforces has stopped accepting this account's
// session, so the sidebar can offer the verification page without anyone probing
// codeforces.com to find out. Best effort: the caller is already returning an error
// the user can act on, and failing to write this flag must not replace it.
func (h *CFWebHandler) markSessionExpired(uid uuid.UUID) {
	if err := h.db.Model(&model.LinkedAccount{}).
		Where("user_id = ? AND provider = ?", uid, "codeforces").
		Update("is_connected", false).Error; err != nil {
		log.Printf("[cf-web] could not flag the expired session: %v", err)
	}
}
