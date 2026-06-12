package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
)

// CFSubmissionFull is the complete Submission object from CF API
type CFSubmissionFull struct {
	ID                  int    `json:"id"`
	ContestID           int    `json:"contestId"`
	CreationTimeSeconds int64  `json:"creationTimeSeconds"`
	RelativeTimeSeconds int64  `json:"relativeTimeSeconds"`
	Problem             CFProblem `json:"problem"`
	Verdict             string `json:"verdict"`
	ProgrammingLanguage string `json:"programmingLanguage"`
}

type CFProblem struct {
	ContestID int      `json:"contestId"`
	Index     string   `json:"index"`
	Name      string   `json:"name"`
	Rating    int      `json:"rating"`
	Tags      []string `json:"tags"`
}

type CFAPIResponse struct {
	Status string          `json:"status"`
	Result json.RawMessage `json:"result"`
}

// FetchCFSubmissions fetches submissions for a handle
func FetchCFSubmissions(handle string, count int) ([]CFSubmissionFull, error) {
	url := fmt.Sprintf("https://codeforces.com/api/user.status?handle=%s&from=1&count=%d", handle, count)
	resp, err := http.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var apiResp CFAPIResponse
	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		return nil, err
	}
	if apiResp.Status != "OK" {
		return nil, fmt.Errorf("CF API failed")
	}

	var subs []CFSubmissionFull
	json.Unmarshal(apiResp.Result, &subs)
	return subs, nil
}
