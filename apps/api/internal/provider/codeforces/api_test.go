package codeforces

import (
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"
)

// newTestAPI points the client at a stub and clears the rate-limit gate, which
// would otherwise add 2.1 s of real sleep between calls in a test.
func newTestAPI(t *testing.T, handler http.HandlerFunc) *API {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	apiGate.mu.Lock()
	apiGate.last = time.Time{}
	apiGate.mu.Unlock()
	a := NewAPI("", "")
	a.base = srv.URL
	return a
}

func TestProblemsetProblemsParsesRefAndSolvedCount(t *testing.T) {
	api := newTestAPI(t, func(w http.ResponseWriter, r *http.Request) {
		if got := r.URL.Query().Get("tags"); got != "dp" {
			t.Errorf("tags param = %q, want dp", got)
		}
		w.Write([]byte(`{"status":"OK","result":{
			"problems":[{"contestId":4,"index":"A","name":"Watermelon","rating":800,"tags":["brute force","math"]}],
			"problemStatistics":[{"contestId":4,"index":"A","solvedCount":123456}]}}`))
	})

	problems, solved, err := api.ProblemsetProblems("dp")
	if err != nil {
		t.Fatalf("ProblemsetProblems: %v", err)
	}
	if len(problems) != 1 {
		t.Fatalf("got %d problems, want 1", len(problems))
	}
	p := problems[0]
	if p.Ref() != "4A" {
		t.Errorf("Ref() = %q, want 4A", p.Ref())
	}
	if p.URL() != "https://codeforces.com/problemset/problem/4/A" {
		t.Errorf("URL() = %q", p.URL())
	}
	if p.Rating != 800 || len(p.Tags) != 2 {
		t.Errorf("rating/tags = %d/%v", p.Rating, p.Tags)
	}
	if solved["4A"] != 123456 {
		t.Errorf("solved[4A] = %d, want 123456", solved["4A"])
	}
}

func TestContestListStartTime(t *testing.T) {
	api := newTestAPI(t, func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"status":"OK","result":[
			{"id":2257,"name":"Round 1","type":"CF","phase":"BEFORE","durationSeconds":7200,"startTimeSeconds":1787631266},
			{"id":9,"name":"No start","type":"CF","phase":"FINISHED"}]}`))
	})

	list, err := api.ContestList(false)
	if err != nil {
		t.Fatalf("ContestList: %v", err)
	}
	if len(list) != 2 {
		t.Fatalf("got %d contests, want 2", len(list))
	}
	if st := list[0].StartTime(); st == nil || st.Unix() != 1787631266 {
		t.Errorf("StartTime() = %v", st)
	}
	// A contest with no startTimeSeconds must yield nil, not the Unix epoch —
	// otherwise it sorts as if it ran in 1970.
	if st := list[1].StartTime(); st != nil {
		t.Errorf("StartTime() = %v, want nil", st)
	}
	if list[0].URL() != "https://codeforces.com/contest/2257" {
		t.Errorf("URL() = %q", list[0].URL())
	}
}

func TestCallSurfacesAPIComment(t *testing.T) {
	api := newTestAPI(t, func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"status":"FAILED","comment":"handle: User with handle nope not found"}`))
	})
	_, err := api.UserStatus("nope", 1, 10)
	if err == nil || !strings.Contains(err.Error(), "not found") {
		t.Fatalf("err = %v, want the API comment", err)
	}
}

// A Cloudflare interstitial is HTML: the error must say "blocked", not complain
// about JSON, or the next person debugging this chases the wrong thing.
func TestCallReportsForbiddenHTMLPlainly(t *testing.T) {
	api := newTestAPI(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		w.Write([]byte(`<html><body>Just a moment...</body></html>`))
	})
	_, err := api.ContestList(false)
	if err == nil || !strings.Contains(err.Error(), "403") || !strings.Contains(err.Error(), "blocked") {
		t.Fatalf("err = %v, want a 403/blocked message", err)
	}
}

func TestSignAddsApiSig(t *testing.T) {
	api := NewAPI("keyy", "secret")
	var gotKey, gotSig string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotKey = r.URL.Query().Get("apiKey")
		gotSig = r.URL.Query().Get("apiSig")
		w.Write([]byte(`{"status":"OK","result":[]}`))
	}))
	defer srv.Close()
	api.base = srv.URL
	apiGate.mu.Lock()
	apiGate.last = time.Time{}
	apiGate.mu.Unlock()

	if _, err := api.ContestList(false); err != nil {
		t.Fatalf("ContestList: %v", err)
	}
	if gotKey != "keyy" {
		t.Errorf("apiKey = %q", gotKey)
	}
	// six random digits followed by a SHA-512 hex digest
	if len(gotSig) != 6+128 {
		t.Fatalf("apiSig length = %d, want 134 (%q)", len(gotSig), gotSig)
	}
	if strings.Trim(gotSig[:6], "0123456789") != "" {
		t.Errorf("apiSig prefix %q is not six digits", gotSig[:6])
	}
}

// TestLiveCodeforcesAPI talks to the real API. Gated by CF_LIVE=1 so the normal
// suite stays offline; it is the only check that catches Codeforces changing a
// field name or putting the API behind the same wall as its HTML pages.
func TestLiveCodeforcesAPI(t *testing.T) {
	if os.Getenv("CF_LIVE") == "" {
		t.Skip("set CF_LIVE=1 to hit the real Codeforces API")
	}
	api := NewAPI("", "")

	problems, solved, err := api.ProblemsetProblems("")
	if err != nil {
		t.Fatalf("live problemset.problems: %v", err)
	}
	if len(problems) < 1000 {
		t.Errorf("got %d problems, expected thousands", len(problems))
	}
	if problems[0].Ref() == "" || problems[0].Name == "" {
		t.Errorf("first problem looks empty: %+v", problems[0])
	}
	t.Logf("problemset: %d problems, %d with solved counts", len(problems), len(solved))

	list, err := api.ContestList(false)
	if err != nil {
		t.Fatalf("live contest.list: %v", err)
	}
	if len(list) < 100 {
		t.Errorf("got %d contests, expected hundreds", len(list))
	}
	t.Logf("contests: %d, newest %q phase=%s", len(list), list[0].Name, list[0].Phase)

	cp, contest, err := api.ContestProblems(list[len(list)-1].ID)
	if err != nil {
		t.Fatalf("live contest.standings: %v", err)
	}
	t.Logf("oldest contest %q has %d problems", contest.Name, len(cp))
}
