package handler

import (
	"log"
	"strings"

	"github.com/IDika31/cphub/api/internal/provider/codeforces"
	"github.com/gofiber/fiber/v2"
)

// maxStatementHTML caps what will be parsed. A Codeforces problem page is 100–300 KB;
// a megabyte is generous, and the limit is here so a bug or a hostile client cannot
// hand the parser something that costs real CPU.
const maxStatementHTML = 1 << 20

// StatementFromExtension takes a Codeforces problem page the extension read in the
// user's own browser and stores the statement parsed out of it.
//
// This is the cheap half of a lesson the rest of this codebase already learned: the
// server has no business fetching codeforces.com HTML. It has to clear a Cloudflare
// managed challenge to do it, which costs a headless Chromium — 432 MB peak on a
// 892 MB box — while the user's browser is already past that gate for free. The
// server-side scrape in ProblemHandler.GetByProblemID stays as the fallback for
// browsers without the extension, behind its six-hour cooldown.
//
// The library is shared, so this writes a row every user reads. That is the same
// contract the problemset sync has, and the parser is the same one: nothing here is
// per user except who paid the request.
//
// Authenticated by HMACVerify (the /api/sync group), so the caller is a paired
// extension.
func (h *ProblemHandler) StatementFromExtension(c *fiber.Ctx) error {
	var in struct {
		ProblemID string `json:"problemId"`
		URL       string `json:"url"`
		HTML      string `json:"html"`
	}
	if err := c.BodyParser(&in); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Body tidak bisa dibaca"})
	}
	in.ProblemID = strings.ToUpper(strings.TrimSpace(in.ProblemID))
	if in.ProblemID == "" || in.HTML == "" {
		return c.Status(400).JSON(fiber.Map{"error": "problemId dan html wajib diisi"})
	}
	if len(in.HTML) > maxStatementHTML {
		return c.Status(fiber.StatusRequestEntityTooLarge).
			JSON(fiber.Map{"error": "halaman terlalu besar untuk diproses"})
	}
	// Same shape the rest of this handler uses, so a ref that could never belong to
	// Codeforces cannot create a row: "4A", "1234B1". The groups also give the
	// canonical URL, which is safer than splitting the ref by hand — the index is not
	// always one character.
	m := cfProblemIDRe.FindStringSubmatch(in.ProblemID)
	if m == nil {
		return c.Status(400).JSON(fiber.Map{"error": "problemId bukan format Codeforces (mis. 4A)"})
	}

	url := strings.TrimSpace(in.URL)
	if url == "" {
		url = "https://codeforces.com/problemset/problem/" + m[1] + "/" + strings.ToUpper(m[2])
	}

	problem, err := codeforces.ParseProblemHTML(in.ProblemID, url, in.HTML)
	if err != nil {
		log.Printf("[cf-ext] statement for %s rejected: %v", in.ProblemID, err)
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}
	if err := h.repo.Upsert(problem); err != nil {
		log.Printf("[cf-ext] storing statement for %s: %v", in.ProblemID, err)
		return c.Status(500).JSON(fiber.Map{"error": "Gagal menyimpan statement"})
	}

	log.Printf("[cf-ext] statement for %s stored from a browser (%d bytes, %d samples)",
		in.ProblemID, len(in.HTML), len(problem.TestCases))
	return c.JSON(fiber.Map{
		"problemId": in.ProblemID,
		"title":     problem.Title,
		"samples":   len(problem.TestCases),
	})
}
