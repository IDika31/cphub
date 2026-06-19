package tlx

import (
	"bytes"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"time"
)

const apiBase = "https://api.tlx.toki.id/v2"
const loginURL = "https://api.tlx.toki.id/api/v2/session/login"

type Client struct {
	httpClient *http.Client
}

func NewClient() *Client {
	return &Client{httpClient: &http.Client{Timeout: 10 * time.Second}}
}

type UserInfo struct {
	Username string
}

type LoginResult struct {
	Token    string
	Username string
}

type ProblemSetInfo struct {
	JID  string
	Name string
}

type Worksheet struct {
	Title         string
	Statement     string // HTML
	TimeLimitMs   int
	MemoryLimitKb int
	ProblemJid    string
}

func (w *Worksheet) TimeLimit() string {
	if w.TimeLimitMs == 0 {
		return ""
	}
	return fmt.Sprintf("%g seconds", float64(w.TimeLimitMs)/1000)
}

func (w *Worksheet) MemoryLimit() string {
	if w.MemoryLimitKb == 0 {
		return ""
	}
	return fmt.Sprintf("%d MB", w.MemoryLimitKb/1024)
}

func (c *Client) get(path, token string, out interface{}) error {
	req, err := http.NewRequest("GET", apiBase+path, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("TLX request failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return fmt.Errorf("TLX API HTTP %d for %s", resp.StatusCode, path)
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

// Login authenticates with TLX using username/password and returns a session token.
func (c *Client) Login(usernameOrEmail, password string) (*LoginResult, error) {
	body, _ := json.Marshal(map[string]string{
		"usernameOrEmail": usernameOrEmail,
		"password":        password,
	})
	req, err := http.NewRequest("POST", loginURL, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("TLX login request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == 400 || resp.StatusCode == 401 || resp.StatusCode == 403 {
		return nil, fmt.Errorf("username atau password salah")
	}
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("TLX login gagal (HTTP %d)", resp.StatusCode)
	}

	var session struct {
		Token   string `json:"token"`
		UserJid string `json:"userJid"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&session); err != nil {
		return nil, fmt.Errorf("failed to parse TLX login response: %w", err)
	}
	if session.Token == "" {
		return nil, fmt.Errorf("no token in TLX login response")
	}

	// Fetch username from /users/me using the token
	userInfo, err := c.VerifyToken(session.Token)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch TLX user info: %w", err)
	}
	return &LoginResult{Token: session.Token, Username: userInfo.Username}, nil
}

// VerifyToken checks the token and returns user info.
func (c *Client) VerifyToken(token string) (*UserInfo, error) {
	var result struct {
		Username string `json:"username"`
	}
	if err := c.get("/users/me", token, &result); err != nil {
		return nil, err
	}
	if result.Username == "" {
		return nil, fmt.Errorf("no username in TLX users/me response")
	}
	return &UserInfo{Username: result.Username}, nil
}

// GetProblemSetBySlug resolves a problemset slug to its JID and display name.
func (c *Client) GetProblemSetBySlug(slug, token string) (*ProblemSetInfo, error) {
	var result struct {
		JID  string `json:"jid"`
		Name string `json:"name"`
	}
	if err := c.get("/problemsets/slug/"+slug, token, &result); err != nil {
		return nil, fmt.Errorf("problemset %q not found: %w", slug, err)
	}
	if result.JID == "" {
		return nil, fmt.Errorf("no jid in problemset response for %q", slug)
	}
	return &ProblemSetInfo{JID: result.JID, Name: result.Name}, nil
}

// GetWorksheet fetches the problem worksheet (statement, limits, problem JID).
func (c *Client) GetWorksheet(jid, alias, token string) (*Worksheet, error) {
	var result struct {
		Problem struct {
			ProblemJid string `json:"problemJid"`
		} `json:"problem"`
		Worksheet struct {
			Statement struct {
				Title string `json:"title"`
				Text  string `json:"text"`
			} `json:"statement"`
			Limits struct {
				TimeLimit   int `json:"timeLimit"`
				MemoryLimit int `json:"memoryLimit"`
			} `json:"limits"`
		} `json:"worksheet"`
	}
	path := fmt.Sprintf("/problemsets/%s/problems/%s/worksheet", jid, alias)
	if err := c.get(path, token, &result); err != nil {
		return nil, fmt.Errorf("worksheet %s/%s not found: %w", jid, alias, err)
	}
	ws := result.Worksheet
	return &Worksheet{
		Title:         ws.Statement.Title,
		Statement:     ws.Statement.Text,
		TimeLimitMs:   ws.Limits.TimeLimit,
		MemoryLimitKb: ws.Limits.MemoryLimit,
		ProblemJid:    result.Problem.ProblemJid,
	}, nil
}

// gradingLanguageMap maps CPHub language IDs to TLX grading language names.
var gradingLanguageMap = map[string]string{
	"cpp17":   "Cpp17",
	"cpp20":   "Cpp20",
	"python3": "Python3",
	"java21":  "Java17",
}

// SubmitResult is the response of a programming submission.
type SubmitResult struct {
	ID  int    `json:"id"`
	JID string `json:"jid"`
}

// Submit posts source code to a TLX problem and returns the submission id/jid.
// containerJid is the problemset JID; problemJid identifies the problem.
func (c *Client) Submit(containerJid, problemJid, language, sourceCode, token string) (*SubmitResult, error) {
	gradingLang, ok := gradingLanguageMap[language]
	if !ok {
		return nil, fmt.Errorf("bahasa %q tidak didukung TLX", language)
	}

	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	_ = w.WriteField("containerJid", containerJid)
	_ = w.WriteField("problemJid", problemJid)
	_ = w.WriteField("gradingLanguage", gradingLang)
	fw, err := w.CreateFormFile("sourceFiles.source", "solution.cpp")
	if err != nil {
		return nil, err
	}
	if _, err := fw.Write([]byte(sourceCode)); err != nil {
		return nil, err
	}
	w.Close()

	req, err := http.NewRequest("POST", apiBase+"/submissions/programming", &buf)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", w.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("TLX submit failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("TLX API HTTP %d for /submissions/programming", resp.StatusCode)
	}

	var result SubmitResult
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to parse TLX submit response: %w", err)
	}
	if result.JID == "" {
		return nil, fmt.Errorf("no jid in TLX submit response")
	}
	return &result, nil
}

func (c *Client) post(path string, body interface{}, out interface{}) error {
	data, err := json.Marshal(body)
	if err != nil {
		return err
	}
	req, err := http.NewRequest("POST", apiBase+path, bytes.NewReader(data))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("TLX request failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return fmt.Errorf("TLX API HTTP %d for %s", resp.StatusCode, path)
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

// UsernameToJID resolves TLX usernames to their JIDs.
func (c *Client) UsernameToJID(usernames []string) (map[string]string, error) {
	var result map[string]string
	if err := c.post("/user-search/username-to-jid", usernames, &result); err != nil {
		return nil, err
	}
	return result, nil
}

// TLXSubmissionPage holds paginated submission results from TLX.
type TLXSubmissionPage struct {
	Data struct {
		Page []TLXSubmissionEntry `json:"page"`
		HasNextPage bool `json:"hasNextPage"`
	} `json:"data"`
	ProblemNamesMap    map[string]string   `json:"problemNamesMap"`
	ProblemAliasesMap  map[string]string   `json:"problemAliasesMap"`
	ContainerNamesMap  map[string]string   `json:"containerNamesMap"`
	ContainerPathsMap  map[string][]string `json:"containerPathsMap"`
}

type TLXSubmissionEntry struct {
	ID             int    `json:"id"`
	JID            string `json:"jid"`
	UserJID        string `json:"userJid"`
	ProblemJID     string `json:"problemJid"`
	ContainerJID   string `json:"containerJid"`
	GradingEngine  string `json:"gradingEngine"`
	GradingLanguage string `json:"gradingLanguage"`
	Time           int64  `json:"time"`
	LatestGrading  *struct {
		Verdict struct {
			Code string `json:"code"`
		} `json:"verdict"`
		Score int `json:"score"`
	} `json:"latestGrading"`
}

// GetSubmissionHistory fetches paginated submission history for a username.
// Pass beforeId=0 for the first page.
func (c *Client) GetSubmissionHistory(username, token string, beforeId int) (*TLXSubmissionPage, error) {
	path := fmt.Sprintf("/submissions/programming?username=%s", username)
	if beforeId > 0 {
		path += fmt.Sprintf("&beforeId=%d", beforeId)
	}
	var result TLXSubmissionPage
	if err := c.get(path, token, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// GetAllSubmissions fetches all submission pages for a username.
func (c *Client) GetAllSubmissions(username, token string, maxPages int) (*TLXSubmissionPage, error) {
	merged := &TLXSubmissionPage{
		ProblemNamesMap:   make(map[string]string),
		ProblemAliasesMap: make(map[string]string),
		ContainerNamesMap: make(map[string]string),
		ContainerPathsMap: make(map[string][]string),
	}

	beforeId := 0
	for page := 0; page < maxPages; page++ {
		result, err := c.GetSubmissionHistory(username, token, beforeId)
		if err != nil {
			return nil, err
		}
		merged.Data.Page = append(merged.Data.Page, result.Data.Page...)
		for k, v := range result.ProblemNamesMap {
			merged.ProblemNamesMap[k] = v
		}
		for k, v := range result.ProblemAliasesMap {
			merged.ProblemAliasesMap[k] = v
		}
		for k, v := range result.ContainerNamesMap {
			merged.ContainerNamesMap[k] = v
		}
		for k, v := range result.ContainerPathsMap {
			merged.ContainerPathsMap[k] = v
		}

		if !result.Data.HasNextPage || len(result.Data.Page) == 0 {
			break
		}
		beforeId = result.Data.Page[len(result.Data.Page)-1].ID
	}
	return merged, nil
}

// Verdict holds the graded result of a submission.
type Verdict struct {
	Code  string // AC, WA, TLE, RTE, ... or "?" while grading
	Score int
}

// GetLatestVerdict fetches the latest submission verdict for a problem+user.
// Returns code "?" while still grading (caller should poll).
func (c *Client) GetLatestVerdict(problemJid, username, submissionJid, token string) (*Verdict, error) {
	var result struct {
		Data struct {
			Page []struct {
				JID           string `json:"jid"`
				LatestGrading *struct {
					Verdict struct {
						Code string `json:"code"`
					} `json:"verdict"`
					Score int `json:"score"`
				} `json:"latestGrading"`
			} `json:"page"`
		} `json:"data"`
	}
	path := fmt.Sprintf("/submissions/programming?problemJid=%s&username=%s", problemJid, username)
	if err := c.get(path, token, &result); err != nil {
		return nil, err
	}
	for _, s := range result.Data.Page {
		if s.JID != submissionJid {
			continue
		}
		if s.LatestGrading == nil {
			return &Verdict{Code: "?"}, nil
		}
		return &Verdict{Code: s.LatestGrading.Verdict.Code, Score: s.LatestGrading.Score}, nil
	}
	// Submission not yet visible in the list — treat as still grading.
	return &Verdict{Code: "?"}, nil
}

