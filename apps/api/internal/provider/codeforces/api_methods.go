package codeforces

import (
	"fmt"
	"net/url"
	"strconv"
	"time"
)

// APIProblem is one entry of problemset.problems. Statements are not part of the
// API, so a problem imported this way carries metadata only.
type APIProblem struct {
	ContestID int      `json:"contestId"`
	Index     string   `json:"index"`
	Name      string   `json:"name"`
	Type      string   `json:"type"`
	Rating    int      `json:"rating"`
	Tags      []string `json:"tags"`
}

// Ref is the identifier CPHub stores in problems.problem_id — "4A", "1234B1".
func (p APIProblem) Ref() string { return strconv.Itoa(p.ContestID) + p.Index }

func (p APIProblem) URL() string {
	return fmt.Sprintf("https://codeforces.com/problemset/problem/%d/%s", p.ContestID, p.Index)
}

// ProblemsetProblems returns the whole public problemset (~10k entries) plus the
// solved counts that come with it. tags is optional and semicolon-separated.
func (a *API) ProblemsetProblems(tags string) ([]APIProblem, map[string]int, error) {
	params := url.Values{}
	if tags != "" {
		params.Set("tags", tags)
	}
	var out struct {
		Problems          []APIProblem `json:"problems"`
		ProblemStatistics []struct {
			ContestID   int    `json:"contestId"`
			Index       string `json:"index"`
			SolvedCount int    `json:"solvedCount"`
		} `json:"problemStatistics"`
	}
	if err := a.call("problemset.problems", params, &out); err != nil {
		return nil, nil, err
	}
	solved := make(map[string]int, len(out.ProblemStatistics))
	for _, s := range out.ProblemStatistics {
		solved[strconv.Itoa(s.ContestID)+s.Index] = s.SolvedCount
	}
	return out.Problems, solved, nil
}

// APIContest mirrors contest.list. Phase is BEFORE, CODING, PENDING_SYSTEM_TEST,
// SYSTEM_TEST or FINISHED — BEFORE is what "registration may be open" looks like.
type APIContest struct {
	ID                  int    `json:"id"`
	Name                string `json:"name"`
	Type                string `json:"type"` // CF, IOI, ICPC
	Phase               string `json:"phase"`
	Frozen              bool   `json:"frozen"`
	DurationSeconds     int64  `json:"durationSeconds"`
	StartTimeSeconds    int64  `json:"startTimeSeconds"`
	RelativeTimeSeconds int64  `json:"relativeTimeSeconds"`
	Kind                string `json:"kind"`
	Difficulty          int    `json:"difficulty"`
}

func (c APIContest) StartTime() *time.Time {
	if c.StartTimeSeconds == 0 {
		return nil
	}
	t := time.Unix(c.StartTimeSeconds, 0).UTC()
	return &t
}

func (c APIContest) URL() string {
	return fmt.Sprintf("https://codeforces.com/contest/%d", c.ID)
}

// ContestList returns every contest, upcoming ones included. gym=true switches to
// the gym catalogue, which is a different and much larger list.
func (a *API) ContestList(gym bool) ([]APIContest, error) {
	params := url.Values{}
	if gym {
		params.Set("gym", "true")
	}
	var out []APIContest
	if err := a.call("contest.list", params, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// ContestProblems lists a contest's problems. contest.standings is the only public
// method that exposes them, and Codeforces answers it for non-admins only as an
// "anonymous GET request with no extra parameters" — so contestId is the sole
// parameter and the signature is deliberately left off. The full ranklist comes
// back with it; `rows` has no field here, so the decoder discards it instead of
// building it in memory.
func (a *API) ContestProblems(contestID int) ([]APIProblem, *APIContest, error) {
	anon := &API{http: a.http, base: a.base}
	params := url.Values{"contestId": {strconv.Itoa(contestID)}}
	var out struct {
		Contest  APIContest   `json:"contest"`
		Problems []APIProblem `json:"problems"`
	}
	if err := anon.call("contest.standings", params, &out); err != nil {
		return nil, nil, err
	}
	return out.Problems, &out.Contest, nil
}

// UserStatus is the submission feed for one handle, newest first. It covers both
// problemset and contest submissions, which is why verdict polling after a submit
// needs no scraping.
func (a *API) UserStatus(handle string, from, count int) ([]CFSubmission, error) {
	if from < 1 {
		from = 1
	}
	if count < 1 {
		count = 50
	}
	params := url.Values{
		"handle": {handle},
		"from":   {strconv.Itoa(from)},
		"count":  {strconv.Itoa(count)},
	}
	var out []CFSubmission
	if err := a.call("user.status", params, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// CFSubmission is one user.status entry.
type CFSubmission struct {
	ID                  int        `json:"id"`
	ContestID           int        `json:"contestId"`
	CreationTimeSeconds int64      `json:"creationTimeSeconds"`
	Problem             APIProblem `json:"problem"`
	Verdict             string     `json:"verdict"`
	ProgrammingLanguage string     `json:"programmingLanguage"`
	TimeConsumedMillis  int        `json:"timeConsumedMillis"`
	MemoryConsumedBytes int64      `json:"memoryConsumedBytes"`
	Passed              int        `json:"passedTestCount"`
}
