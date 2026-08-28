package repository

import (
	"testing"

	"github.com/IDika31/cphub/api/internal/model"

	"github.com/google/uuid"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// setupProblemDB builds the three tables the per-viewer status filter reads. The DDL is
// written out rather than AutoMigrated because production runs plain SQL migrations, and a
// gorm-generated table would hide a mismatch between the two.
func setupProblemDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	stmts := []string{
		`CREATE TABLE problems (
			id TEXT PRIMARY KEY, provider TEXT, problem_id TEXT, title TEXT, statement TEXT,
			difficulty INTEGER, tags TEXT, status TEXT, source_url TEXT, time_limit INTEGER,
			memory_limit INTEGER, created_at DATETIME, updated_at DATETIME
		)`,
		`CREATE TABLE external_submissions (
			id TEXT PRIMARY KEY, user_id TEXT, provider TEXT, problem_ref TEXT, verdict TEXT,
			created_at DATETIME
		)`,
		`CREATE TABLE local_submissions (
			id TEXT PRIMARY KEY, user_id TEXT, problem_id TEXT, verdict TEXT, created_at DATETIME
		)`,
	}
	for _, q := range stmts {
		if err := db.Exec(q).Error; err != nil {
			t.Fatalf("create table: %v", err)
		}
	}
	return db
}

func seedProblem(t *testing.T, db *gorm.DB, id uuid.UUID, provider, ref, sharedStatus string) {
	t.Helper()
	if err := db.Exec(
		`INSERT INTO problems (id, provider, problem_id, title, status, tags, created_at)
		 VALUES (?, ?, ?, ?, ?, '["dp"]', CURRENT_TIMESTAMP)`,
		id.String(), provider, ref, "problem "+ref, sharedStatus,
	).Error; err != nil {
		t.Fatalf("seed problem %s: %v", ref, err)
	}
}

// refsFrom names the rows a filter returned, so a failure says which problems came back
// instead of only how many.
func refsFrom(problems []model.Problem) []string {
	out := make([]string, 0, len(problems))
	for _, p := range problems {
		out = append(out, p.ProblemID)
	}
	return out
}

// The bug this replaces: ?status=solved filtered problems.status, a column the whole
// library shares, so it answered with the problems ANY user had solved while the badges
// beside them were overlaid from the caller's own history.
func TestFindAllStatusIsPerViewer(t *testing.T) {
	db := setupProblemDB(t)
	repo := &ProblemRepository{db: db}
	me, other := uuid.New(), uuid.New()
	mine, theirs, untouched := uuid.New(), uuid.New(), uuid.New()

	// Every row carries the shared column already set to "solved" — the old filter's
	// input — so a test that passes cannot be reading it.
	seedProblem(t, db, mine, "codeforces", "4A", "solved")
	seedProblem(t, db, theirs, "codeforces", "4B", "solved")
	seedProblem(t, db, untouched, "codeforces", "4C", "solved")

	db.Exec(`INSERT INTO external_submissions (id, user_id, provider, problem_ref, verdict) VALUES (?, ?, 'codeforces', '4A', 'OK')`,
		uuid.New().String(), me.String())
	db.Exec(`INSERT INTO external_submissions (id, user_id, provider, problem_ref, verdict) VALUES (?, ?, 'codeforces', '4B', 'OK')`,
		uuid.New().String(), other.String())

	got, total, err := repo.FindAll(map[string]interface{}{"status": "solved", "userId": me}, 50, 0)
	if err != nil {
		t.Fatalf("FindAll: %v", err)
	}
	if total != 1 || len(got) != 1 || got[0].ProblemID != "4A" {
		t.Fatalf("solved = %v (total %d), want only 4A — 4B is another user's solve", refsFrom(got), total)
	}
}

// "Attempted" is tried-but-not-solved: a wrong answer counts, and an AC on the same
// problem takes it out of the bucket.
func TestFindAllAttemptedExcludesSolved(t *testing.T) {
	db := setupProblemDB(t)
	repo := &ProblemRepository{db: db}
	me := uuid.New()
	wrong, done := uuid.New(), uuid.New()
	seedProblem(t, db, wrong, "codeforces", "4A", "synced")
	seedProblem(t, db, done, "codeforces", "4B", "synced")

	db.Exec(`INSERT INTO external_submissions (id, user_id, provider, problem_ref, verdict) VALUES (?, ?, 'codeforces', '4A', 'WRONG_ANSWER')`,
		uuid.New().String(), me.String())
	// A local grader run is the other half of "tried", keyed on the problem's own id.
	db.Exec(`INSERT INTO local_submissions (id, user_id, problem_id, verdict) VALUES (?, ?, ?, 'AC')`,
		uuid.New().String(), me.String(), done.String())

	att, _, err := repo.FindAll(map[string]interface{}{"status": "attempted", "userId": me}, 50, 0)
	if err != nil {
		t.Fatalf("FindAll(attempted): %v", err)
	}
	if len(att) != 1 || att[0].ProblemID != "4A" {
		t.Errorf("attempted = %v, want only 4A", refsFrom(att))
	}

	solved, _, err := repo.FindAll(map[string]interface{}{"status": "solved", "userId": me}, 50, 0)
	if err != nil {
		t.Fatalf("FindAll(solved): %v", err)
	}
	if len(solved) != 1 || solved[0].ProblemID != "4B" {
		t.Errorf("solved = %v, want only 4B — the local AC counts", refsFrom(solved))
	}

	unsolved, _, err := repo.FindAll(map[string]interface{}{"status": "unsolved", "userId": me}, 50, 0)
	if err != nil {
		t.Fatalf("FindAll(unsolved): %v", err)
	}
	if len(unsolved) != 0 {
		t.Errorf("unsolved = %v, want none — both rows were touched", refsFrom(unsolved))
	}
}

// Without a viewer the filter cannot mean anything, and answering with the whole library
// would be worse than saying so.
func TestFindAllStatusNeedsAViewer(t *testing.T) {
	db := setupProblemDB(t)
	repo := &ProblemRepository{db: db}
	seedProblem(t, db, uuid.New(), "codeforces", "4A", "solved")

	if _, _, err := repo.FindAll(map[string]interface{}{"status": "solved"}, 50, 0); err == nil {
		t.Error("err = nil, want a complaint about the missing user")
	}
	if _, _, err := repo.FindAll(map[string]interface{}{"status": "nonsense", "userId": uuid.New()}, 50, 0); err == nil {
		t.Error("err = nil, want a complaint about the unknown status")
	}
}
