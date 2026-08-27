package handler

import (
	"errors"
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"

	"github.com/IDika31/cphub/api/internal/model"
	"github.com/IDika31/cphub/api/internal/provider/codeforces"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

// errCFSessionExpired marks the one Codeforces failure the user can fix on the spot.
// It is matched with errors.Is rather than by string, and cfSessionError turns it into
// a response carrying ErrCodeCFSessionExpired so the web app can reopen the extension
// login flow instead of printing prose and stopping there.
var errCFSessionExpired = errors.New("sesi Codeforces kedaluwarsa — hubungkan ulang di halaman Connections")

// cfSessionError renders a cfSession failure. Every caller used to inline the same
// 400, which meant an expired session was indistinguishable from a malformed request
// and the UI could not act on either.
func cfSessionError(c *fiber.Ctx, err error) error {
	if errors.Is(err, errCFSessionExpired) {
		return c.Status(fiber.StatusUnauthorized).
			JSON(fiber.Map{"error": err.Error(), "code": ErrCodeCFSessionExpired})
	}
	return c.Status(400).JSON(fiber.Map{"error": err.Error()})
}

// cfSession restores the stored browser session and proves it is still valid.
// Codeforces expires sessions on its own schedule, so an expired one is renewed
// from the saved password when the user opted into that, and otherwise reported as
// something only they can fix.
func (h *CFWebHandler) cfSession(uid uuid.UUID) (*codeforces.WebSession, *model.LinkedAccount, error) {
	var account model.LinkedAccount
	if err := h.db.Where("user_id = ? AND provider = ?", uid, "codeforces").First(&account).Error; err != nil {
		return nil, nil, fmt.Errorf("akun Codeforces belum dihubungkan — login di halaman Connections")
	}
	session, err := codeforces.NewWebSession()
	if err != nil {
		return nil, nil, err
	}
	if account.SessionData != "" {
		if err := session.Import([]byte(account.SessionData)); err != nil {
			log.Printf("[cf-web] session import failed: %v", err)
		}
		if who, cErr := session.LoggedInHandle(); cErr == nil && who != "" {
			return session, &account, nil
		}
	}

	if account.PasswordEnc == "" || h.box == nil {
		// No stored password to renew with — which is the normal case now that login
		// happens in the user's browser. The extension is asked to log in again.
		return nil, nil, errCFSessionExpired
	}
	password, err := h.box.Open(account.PasswordEnc)
	if err != nil {
		return nil, nil, fmt.Errorf("sesi kedaluwarsa dan password tersimpan tidak bisa dipakai: %w", err)
	}
	handle, err := session.Login(account.Handle, password)
	if err != nil {
		// The saved password no longer works, so this is the user's problem again.
		return nil, nil, fmt.Errorf("%w (login ulang otomatis gagal: %v)", errCFSessionExpired, err)
	}
	blob, _ := session.Export()
	now := time.Now()
	h.db.Model(&model.LinkedAccount{}).Where("id = ?", account.ID).
		Updates(map[string]interface{}{"session_data": string(blob), "session_checked_at": &now})
	log.Printf("[cf-web] session renewed for %s", handle)
	return session, &account, nil
}

// Languages lists the submit form's own programTypeId options. The ids change
// whenever Codeforces updates a compiler, so the UI reads them live instead of
// carrying a table.
func (h *CFWebHandler) Languages(c *fiber.Ctx) error {
	uid, err := uuid.Parse(c.Locals("userId").(string))
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "Unauthenticated"})
	}
	contestID := c.QueryInt("contestId", 1)
	session, _, err := h.cfSession(uid)
	if err != nil {
		return cfSessionError(c, err)
	}
	langs, err := session.LanguageOptions(contestID)
	if err != nil {
		return c.Status(fiber.StatusFailedDependency).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"data": langs})
}

// cfLanguageAliases map what CPHub's editor calls a language onto the words
// Codeforces prints in its dropdown. Matching on the page's own text keeps working
// when the numeric ids move.
//
// Codeforces writes its C++ entries as "GNU G++20 13.2 (64 bit, winlibs)" — G++,
// not C++ — so the needles below lead with that spelling and keep "C++" as a
// fallback for the Clang and MSVC entries. Bare "cpp" resolves to G++20 on purpose:
// it is the default most rounds are solved in.
var cfLanguageAliases = map[string][]string{
	"cpp23":   {"G++23", "C++23"},
	"cpp20":   {"G++20", "C++20"},
	"cpp17":   {"G++17", "C++17"},
	"cpp14":   {"G++14", "C++14"},
	"cpp":     {"G++20", "G++17", "G++23", "C++"},
	"c":       {"GCC C11", "GNU GCC C"},
	"python3": {"Python 3", "PyPy 3"},
	"python":  {"Python 3", "PyPy 3"},
	"pypy3":   {"PyPy 3"},
	"java":    {"Java 21", "Java 17", "Java"},
	"java21":  {"Java 21"},
	"java17":  {"Java 17"},
	"nodejs":  {"Node.js", "JavaScript"},
	"js":      {"Node.js", "JavaScript"},
	"kotlin":  {"Kotlin"},
	"go":      {"Go"},
	"rust":    {"Rust"},
	"csharp":  {"C#"},
}

// pickLanguage resolves the client's language to a programTypeId. A numeric value
// is taken as an id already, so a UI that read Languages() can pass it straight
// through.
func pickLanguage(langs []codeforces.Language, want string) (string, error) {
	want = strings.TrimSpace(want)
	if want == "" {
		return "", fmt.Errorf("language wajib diisi")
	}
	if _, err := strconv.Atoi(want); err == nil {
		for _, l := range langs {
			if l.ID == want {
				return l.ID, nil
			}
		}
		return "", fmt.Errorf("programTypeId %s tidak ada di daftar bahasa akun ini", want)
	}
	for _, needle := range cfLanguageAliases[strings.ToLower(want)] {
		for _, l := range langs {
			if strings.Contains(l.Name, needle) {
				return l.ID, nil
			}
		}
	}
	// Last resort: the caller may have sent the dropdown text itself.
	for _, l := range langs {
		if strings.EqualFold(l.Name, want) || strings.Contains(strings.ToLower(l.Name), strings.ToLower(want)) {
			return l.ID, nil
		}
	}
	return "", fmt.Errorf("bahasa %q tidak cocok dengan opsi Codeforces mana pun", want)
}
