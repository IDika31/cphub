package repository

import (
	"fmt"
	"strings"
	"time"

	"github.com/IDika31/cphub/api/internal/model"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type UserRepository struct{ db *gorm.DB }
type ProblemRepository struct{ db *gorm.DB }
type SubmissionRepository struct{ db *gorm.DB }

func NewUserRepository(db *gorm.DB) *UserRepository             { return &UserRepository{db} }
func NewProblemRepository(db *gorm.DB) *ProblemRepository       { return &ProblemRepository{db} }
func NewSubmissionRepository(db *gorm.DB) *SubmissionRepository { return &SubmissionRepository{db} }

// User
func (r *UserRepository) FindByID(id uuid.UUID) (*model.User, error) {
	var u model.User
	err := r.db.First(&u, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (r *UserRepository) FindByEmail(email string) (*model.User, error) {
	var u model.User
	err := r.db.First(&u, "email = ?", email).Error
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (r *UserRepository) Create(u *model.User) error { return r.db.Create(u).Error }
func (r *UserRepository) Update(u *model.User) error { return r.db.Save(u).Error }

// Problem
func (r *ProblemRepository) FindAll(filter map[string]interface{}, limit, offset int) ([]model.Problem, int64, error) {
	var problems []model.Problem
	var total int64
	query := r.db.Model(&model.Problem{})

	if provider, ok := filter["provider"]; ok {
		query = query.Where("provider = ?", provider)
	}
	if tag, ok := filter["tag"]; ok {
		// tags is a JSON array stored as text, so the quotes anchor the match on a
		// whole element: a bare substring made ?tag=graph hit "graph matchings" and
		// ?tag=string hit "string suffix structures". LOWER on both sides because
		// Postgres LIKE is case-sensitive and the providers store their tags
		// lowercase, so ?tag=DP came back as an empty page instead of a match.
		// LIKE metacharacters in the value are escaped so a tag containing % or _
		// cannot turn into a wildcard.
		t := strings.ToLower(strings.TrimSpace(tag.(string)))
		t = strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(t)
		query = query.Where("LOWER(tags) LIKE ?", `%"`+t+`"%`)
	}
	if difficulty, ok := filter["difficulty"]; ok {
		query = query.Where("difficulty = ?", difficulty)
	}
	// status is per viewer, so it is answered from that viewer's own submissions and
	// never from problems.status. That column is shared by the whole library — one
	// row per problem, no owner — so filtering on it returned the problems SOMEBODY
	// had solved, and the page then labelled them from the caller's own history (see
	// applyUserStatus): a listing that disagreed with itself, row by row.
	//
	// The predicates are the SQL twin of UserProblemStatus: external rows join on
	// provider + problem_ref, local grader runs on the problem's primary key, and
	// Codeforces' "OK" counts as accepted alongside "AC".
	if status, ok := filter["status"].(string); ok {
		userID, hasUser := filter["userId"].(uuid.UUID)
		if !hasUser {
			return nil, 0, fmt.Errorf("status filter needs a user")
		}
		const solvedSQL = `(EXISTS (SELECT 1 FROM external_submissions es
			WHERE es.user_id = ? AND es.provider = problems.provider
			  AND es.problem_ref = problems.problem_id
			  AND UPPER(TRIM(es.verdict)) IN ('OK','AC','ACCEPTED'))
			OR EXISTS (SELECT 1 FROM local_submissions ls
			WHERE ls.user_id = ? AND ls.problem_id = problems.id
			  AND UPPER(TRIM(ls.verdict)) = 'AC'))`
		const touchedSQL = `(EXISTS (SELECT 1 FROM external_submissions es
			WHERE es.user_id = ? AND es.provider = problems.provider
			  AND es.problem_ref = problems.problem_id)
			OR EXISTS (SELECT 1 FROM local_submissions ls
			WHERE ls.user_id = ? AND ls.problem_id = problems.id))`
		switch status {
		case "solved":
			query = query.Where(solvedSQL, userID, userID)
		case "attempted":
			// Tried but not yet solved, which is what the badge means.
			query = query.Where(touchedSQL, userID, userID).Where("NOT "+solvedSQL, userID, userID)
		case "unsolved":
			query = query.Where("NOT "+touchedSQL, userID, userID)
		default:
			return nil, 0, fmt.Errorf("unknown status %q", status)
		}
	}
	// The handler has always passed "q" through; nothing read it, so
	// /api/problems?q=... quietly returned the whole table.
	if q, ok := filter["q"]; ok {
		like := "%" + strings.ToLower(q.(string)) + "%"
		query = query.Where(
			"LOWER(title) LIKE ? OR LOWER(problem_id) LIKE ? OR LOWER(tags) LIKE ?",
			like, like, like,
		)
	}

	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	// id breaks created_at ties: the problemset sync inserts in batches of 500 and
	// GORM stamps one timestamp per batch, so ~500 rows share a created_at and a
	// LIMIT/OFFSET over that alone can put the same problem on two pages and none
	// on the third. No Preload here — the list only renders title/difficulty/tags,
	// and shipping every sample I/O for 50 problems is a second query nobody reads.
	err := query.Order("created_at DESC").Order("id").Limit(limit).Offset(offset).Find(&problems).Error
	return problems, total, err
}

func (r *ProblemRepository) FindByID(id uuid.UUID) (*model.Problem, error) {
	var p model.Problem
	err := r.db.Preload("TestCases").First(&p, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *ProblemRepository) FindByProviderAndID(provider, problemID string) (*model.Problem, error) {
	var p model.Problem
	err := r.db.Where("provider = ? AND problem_id = ?", provider, problemID).Preload("TestCases").First(&p).Error
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *ProblemRepository) FindByProblemID(problemID string) (*model.Problem, error) {
	var p model.Problem
	err := r.db.Where("problem_id = ?", problemID).Preload("TestCases").First(&p).Error
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *ProblemRepository) Upsert(p *model.Problem) error {
	existing, err := r.FindByProviderAndID(p.Provider, p.ProblemID)
	if err != nil {
		return r.db.Create(p).Error
	}
	p.ID = existing.ID

	// Omit associations: GORM would auto-save p.TestCases here with the wrong
	// parent id, on top of the explicit replace below.
	if err := r.db.Model(existing).Omit(clause.Associations).Updates(p).Error; err != nil {
		return err
	}

	// Test cases are replaced wholesale, but a payload carrying FEWER samples
	// than we already have is treated as the poorer source and ignored. Without
	// this, one auto-sync from a scraper that only caught the first example wipes
	// a complete set — which is exactly how multi-example CF problems ended up
	// with a single test case.
	if len(p.TestCases) == 0 {
		return nil
	}
	stored := 0
	for _, tc := range existing.TestCases {
		if !tc.IsCustom {
			stored++
		}
	}
	if len(p.TestCases) < stored {
		return nil
	}

	r.db.Where("problem_id = ? AND is_custom = ?", existing.ID, false).Delete(&model.TestCase{})
	for i := range p.TestCases {
		p.TestCases[i].ID = uuid.New()
		p.TestCases[i].ProblemID = existing.ID
		p.TestCases[i].Order = i
	}
	return r.db.Create(&p.TestCases).Error
}

func (r *ProblemRepository) Search(query string, limit int) ([]model.Problem, error) {
	var problems []model.Problem
	like := "%" + strings.ToLower(query) + "%"
	err := r.db.Where("LOWER(title) LIKE ? OR LOWER(problem_id) LIKE ? OR LOWER(statement) LIKE ?", like, like, like).
		Limit(limit).Preload("TestCases").Find(&problems).Error
	return problems, err
}

// UserProblemStatus reports which of the given problems the user has solved and
// which they merely attempted. External submissions are keyed by
// "provider/problemRef", local runs by the problem UUID, so both key shapes come
// back in the same maps and the caller checks each.
func (r *ProblemRepository) UserProblemStatus(
	userID uuid.UUID, problemIDs []uuid.UUID, refs []string,
) (solved, attempted map[string]bool, err error) {
	solved = map[string]bool{}
	attempted = map[string]bool{}

	var ext []struct {
		Provider   string
		ProblemRef string
		Verdict    string
	}
	if err = r.db.Table("external_submissions").
		Select("provider, problem_ref, verdict").
		Where("user_id = ? AND problem_ref IN ?", userID, refs).
		Scan(&ext).Error; err != nil {
		return nil, nil, err
	}
	for _, e := range ext {
		key := e.Provider + "/" + e.ProblemRef
		attempted[key] = true
		switch strings.ToUpper(strings.TrimSpace(e.Verdict)) {
		case "OK", "AC", "ACCEPTED":
			solved[key] = true
		}
	}

	var local []struct {
		ProblemID uuid.UUID
		Verdict   string
	}
	if err = r.db.Table("local_submissions").
		Select("problem_id, verdict").
		Where("user_id = ? AND problem_id IN ?", userID, problemIDs).
		Scan(&local).Error; err != nil {
		return nil, nil, err
	}
	for _, l := range local {
		key := l.ProblemID.String()
		attempted[key] = true
		if strings.EqualFold(strings.TrimSpace(l.Verdict), "AC") {
			solved[key] = true
		}
	}

	return solved, attempted, nil
}

// Submission
//
// Local runs carry no provider of their own — it comes from the problem they ran
// against, so a provider filter has to join. The sidebar links to
// /submissions?provider=codeforces, which used to be silently ignored here.
// LocalRun is one grader run already joined to its problem.
//
// This used to return model.LocalSubmission with Preload("Problem"), which came
// back empty every time: model.Problem has its own field called ProblemID (the
// provider's problem code), so GORM resolved the association against
// problems.problem_id instead of the primary key and preloaded with a query that
// matched nothing. Nothing errored — the Submissions table simply rendered every
// local run as "(tanpa judul)" with a blank provider. An explicit join says what
// it means and costs one query instead of two.
type LocalRun struct {
	ID           uuid.UUID
	ProblemID    uuid.UUID
	ProblemTitle string
	Provider     string
	ProblemRef   string
	Language     string
	Verdict      string
	Runtime      int
	Memory       int
	PassedTests  int
	TotalTests   int
	ExecutedAt   *time.Time
	CreatedAt    time.Time
}

func (r *SubmissionRepository) FindLocalByUser(userID uuid.UUID, provider string, limit, offset int) ([]LocalRun, int64, error) {
	var rows []LocalRun
	var total int64

	base := func() *gorm.DB {
		q := r.db.Table("local_submissions AS ls").
			Joins("LEFT JOIN problems p ON p.id = ls.problem_id").
			Where("ls.user_id = ?", userID)
		if provider != "" {
			q = q.Where("p.provider = ?", provider)
		}
		return q
	}

	if err := base().Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err := base().
		Select(`ls.id, ls.problem_id,
			COALESCE(p.title, '') AS problem_title,
			COALESCE(p.provider, '') AS provider,
			COALESCE(p.problem_id, '') AS problem_ref,
			ls.language, ls.verdict, ls.runtime, ls.memory,
			ls.passed_tests, ls.total_tests, ls.executed_at, ls.created_at`).
		Order("ls.executed_at DESC NULLS LAST").
		Order("ls.created_at DESC").
		// Unique tiebreak, or a page boundary inside a group of equal timestamps
		// can repeat a row on the next page and drop another entirely.
		Order("ls.id").
		Limit(limit).Offset(offset).
		Scan(&rows).Error
	return rows, total, err
}

func (r *SubmissionRepository) CreateLocal(sub *model.LocalSubmission) error {
	return r.db.Create(sub).Error
}

func (r *SubmissionRepository) FindExternalByUser(userID uuid.UUID, provider string, limit, offset int) ([]model.ExternalSubmission, int64, error) {
	var subs []model.ExternalSubmission
	var total int64
	base := func() *gorm.DB {
		q := r.db.Model(&model.ExternalSubmission{}).Where("user_id = ?", userID)
		if provider != "" {
			q = q.Where("provider = ?", provider)
		}
		return q
	}
	if err := base().Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err := base().
		Order("submitted_at DESC NULLS LAST").
		Order("created_at DESC").
		// Same reason as the local list: one sync writes many rows with the same
		// created_at, so without a unique tiebreak paging can duplicate and skip.
		Order("id").
		Limit(limit).Offset(offset).
		Find(&subs).Error
	return subs, total, err
}

// CreateExternal is idempotent per (provider, submissionId). FirstOrCreate alone
// would not scope the lookup to the owner, so the where clause pins both.
func (r *SubmissionRepository) CreateExternal(sub *model.ExternalSubmission) error {
	// Scoped by user: a submission id is only unique within one account's feed,
	// so matching on (provider, submission_id) alone handed the row to whoever
	// synced it first and made it invisible to everyone else.
	return r.db.Where("user_id = ? AND provider = ? AND submission_id = ?",
		sub.UserID, sub.Provider, sub.SubmissionID).
		FirstOrCreate(sub).Error
}
