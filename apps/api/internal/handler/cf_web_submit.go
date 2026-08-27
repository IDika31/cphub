package handler

import (
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"

	"github.com/IDika31/cphub/api/internal/model"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

// Submit sends a solution to Codeforces and records the outcome. The verdict comes
// from the official API rather than from scraping the status table: user.status
// covers problemset and contest submissions alike.
func (h *CFWebHandler) Submit(c *fiber.Ctx) error {
	uid, err := uuid.Parse(c.Locals("userId").(string))
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "Unauthenticated"})
	}
	var in struct {
		ProblemID  string `json:"problemId"`
		SourceCode string `json:"sourceCode"`
		Language   string `json:"language"`
	}
	if err := c.BodyParser(&in); err != nil || in.ProblemID == "" || in.SourceCode == "" {
		return c.Status(400).JSON(fiber.Map{"error": "problemId, sourceCode, language wajib diisi"})
	}

	problem, contestID, index, pErr := h.resolveCFProblem(in.ProblemID)
	if pErr != nil {
		return pErr.send(c)
	}

	session, account, err := h.cfSession(uid)
	if err != nil {
		return cfSessionError(c, err)
	}

	langs, err := session.LanguageOptions(contestID)
	if err != nil {
		return c.Status(fiber.StatusFailedDependency).JSON(fiber.Map{"error": err.Error()})
	}
	langID, err := pickLanguage(langs, in.Language)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": err.Error()})
	}

	// Newest submission id before the submit, so the poll below can tell the new one
	// from whatever was already there.
	var lastID int
	if prev, pErr := h.api.UserStatus(account.Handle, 1, 1); pErr == nil && len(prev) > 0 {
		lastID = prev[0].ID
	}

	if err := session.Submit(contestID, index, langID, in.SourceCode); err != nil {
		log.Printf("[cf-web] submit %s failed: %v", problem.ProblemID, err)
		return c.Status(fiber.StatusFailedDependency).JSON(fiber.Map{"error": err.Error()})
	}

	verdict, subID, runtime, memory := h.pollVerdict(account.Handle, problem.ProblemID, lastID)

	h.recordCFSubmission(uid, problem, in.Language, verdict, subID, runtime, memory)
	log.Printf("[cf-web] %s submitted %s as lang %s → %s (id=%d)", account.Handle, problem.ProblemID, langID, verdict, subID)
	return c.JSON(cfSubmitReply(contestID, verdict, subID, runtime))
}

// cfProblemError carries a lookup failure with the status it should answer with, so
// resolveCFProblem can be shared by handlers that must reply differently from each
// other only in their own logic, not in this.
type cfProblemError struct {
	status  int
	message string
}

func (e *cfProblemError) send(c *fiber.Ctx) error {
	return c.Status(e.status).JSON(fiber.Map{"error": e.message})
}

// resolveCFProblem accepts either CPHub's own UUID or a Codeforces ref like "4A" and
// returns the problem plus its contest id and index.
func (h *CFWebHandler) resolveCFProblem(problemID string) (model.Problem, int, string, *cfProblemError) {
	var (
		problem model.Problem
		err     error
	)
	if pid, pErr := uuid.Parse(problemID); pErr == nil {
		err = h.db.First(&problem, "id = ?", pid).Error
	} else {
		err = h.db.First(&problem, "provider = ? AND problem_id = ?", "codeforces", problemID).Error
	}
	if err != nil {
		return problem, 0, "", &cfProblemError{404, "Problem tidak ditemukan"}
	}
	if problem.Provider != "codeforces" {
		return problem, 0, "", &cfProblemError{400, "Submit ini hanya untuk problem Codeforces"}
	}
	m := cfProblemIDRe.FindStringSubmatch(problem.ProblemID)
	if m == nil {
		return problem, 0, "", &cfProblemError{400, "problemId Codeforces tidak valid: " + problem.ProblemID}
	}
	contestID, _ := strconv.Atoi(m[1])
	return problem, contestID, strings.ToUpper(m[2]), nil
}

// recordCFSubmission files the submission in CPHub's own history. A failure here is
// logged rather than returned: the code is already on Codeforces, so telling the user
// the submit failed would be a lie.
func (h *CFWebHandler) recordCFSubmission(uid uuid.UUID, problem model.Problem, language, verdict string, subID, runtime int, memory int64) {
	extSub := &model.ExternalSubmission{
		UserID:       uid,
		ProblemID:    problem.ID,
		Provider:     "codeforces",
		SubmissionID: strconv.Itoa(subID),
		ProblemTitle: problem.Title,
		ProblemRef:   problem.ProblemID,
		ProblemGroup: problem.ProblemGroup,
		Language:     language,
		Verdict:      verdict,
		Runtime:      runtime,
		Memory:       int(memory / 1024),
	}
	if err := h.db.Create(extSub).Error; err != nil {
		log.Printf("[cf-web] failed to record submission %d: %v", subID, err)
	}
}

// cfSubmitReply is what the editor's submit popup reads.
//
// The verdict is normalised here, not passed through. Codeforces answers in its own
// long form ("WRONG_ANSWER", "OK"), TLX answers in short codes ("WA", "AC"), and the
// popup keys its label and colour off the short set — so a raw Codeforces verdict fell
// through to the popup's default and displayed as "Unknown" on a submission that had a
// perfectly clear result. Measured on 2257D, verdict WRONG_ANSWER.
//
// normalizeVerdict is the same mapping every dashboard aggregate already uses, so both
// judges land on one vocabulary rather than two.
//
// The database keeps the provider's own wording (see recordCFSubmission): it is more
// specific than the canonical set, existing rows are stored that way, and the dashboard
// normalises on read anyway.
func cfSubmitReply(contestID int, verdict string, subID, runtime int) fiber.Map {
	canonical := normalizeVerdict(verdict)
	return fiber.Map{
		"submissionId": subID,
		"verdict":      canonical,
		"pending":      canonical == VerdictPend,
		"runtime":      runtime,
		"url":          fmt.Sprintf("https://codeforces.com/contest/%d/submission/%d", contestID, subID),
	}
}

// pollVerdict watches user.status for the submission that appeared after lastID.
// The API is rate-limited to one call per two seconds, so this is a handful of
// calls over roughly half a minute — enough for most verdicts, and the caller is
// told when it is still testing.
func (h *CFWebHandler) pollVerdict(handle, problemRef string, lastID int) (verdict string, subID, runtime int, memory int64) {
	for attempt := 0; attempt < 12; attempt++ {
		subs, err := h.api.UserStatus(handle, 1, 5)
		if err != nil {
			log.Printf("[cf-web] verdict poll failed: %v", err)
			continue
		}
		for _, s := range subs {
			if s.ID <= lastID || s.Problem.Ref() != problemRef {
				continue
			}
			subID, runtime, memory = s.ID, s.TimeConsumedMillis, s.MemoryConsumedBytes
			verdict = s.Verdict
			if verdict != "" && verdict != "TESTING" {
				return verdict, subID, runtime, memory
			}
			break
		}
		time.Sleep(500 * time.Millisecond)
	}
	if verdict == "" {
		verdict = "TESTING"
	}
	return verdict, subID, runtime, memory
}

// Register signs the account up for a contest. Codeforces opens registration six
// hours before a round and closes it five minutes before the start, so a failure
// here is usually a closed window rather than a broken call.
func (h *CFWebHandler) Register(c *fiber.Ctx) error {
	uid, err := uuid.Parse(c.Locals("userId").(string))
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "Unauthenticated"})
	}
	contestID, err := strconv.Atoi(c.Params("id"))
	if err != nil || contestID <= 0 {
		return c.Status(400).JSON(fiber.Map{"error": "contestId tidak valid"})
	}

	session, account, err := h.cfSession(uid)
	if err != nil {
		return cfSessionError(c, err)
	}
	already, err := session.RegisterContest(contestID)
	if err != nil {
		log.Printf("[cf-web] register contest %d failed: %v", contestID, err)
		return c.Status(fiber.StatusFailedDependency).JSON(fiber.Map{"error": err.Error()})
	}

	// Recorded either way. "Already registered" is the only signal CPHub ever gets about
	// a registration made directly on codeforces.com, so throwing it away would mean the
	// contest list keeps offering a button for something the user is already in.
	ref := strconv.Itoa(contestID)
	reg := model.ContestRegistration{
		UserID: uid, Provider: "codeforces", ContestRef: ref, RegisteredAt: time.Now(),
	}
	if dbErr := h.db.Where("user_id = ? AND provider = ? AND contest_ref = ?", uid, "codeforces", ref).
		FirstOrCreate(&reg).Error; dbErr != nil {
		// The registration itself succeeded on Codeforces, so this is not the user's
		// problem: the button will simply still be there next time.
		log.Printf("[cf-web] could not record registration for contest %s: %v", ref, dbErr)
	}

	log.Printf("[cf-web] %s registered for contest %d (already=%t)", account.Handle, contestID, already)
	return c.JSON(fiber.Map{
		"contestId":  contestID,
		"handle":     account.Handle,
		"registered": true,
		"already":    already,
	})
}
