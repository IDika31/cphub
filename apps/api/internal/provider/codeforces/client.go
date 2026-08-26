package codeforces

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

const (
	BaseURL  = "https://codeforces.com/api"
	OAuthURL = "https://codeforces.com/oauth/authorize"
	TokenURL = "https://codeforces.com/oauth/token"
)

type Client struct {
	httpClient *http.Client
	apiKey     string
	secret     string
}

func NewClient(apiKey, secret string) *Client {
	return &Client{
		httpClient: &http.Client{Timeout: 10 * time.Second},
		apiKey:     apiKey,
		secret:     secret,
	}
}

type UserInfo struct {
	Handle    string `json:"handle"`
	Rating    int    `json:"rating"`
	MaxRating int    `json:"maxRating"`
	Rank      string `json:"rank"`
	Avatar    string `json:"titlePhoto"`
}

type CFResponse struct {
	Status  string          `json:"status"`
	Result  json.RawMessage `json:"result"`
	Comment string          `json:"comment"`
}

// GetUserInfo fetches Codeforces user info by handle
func (c *Client) GetUserInfo(handle string) (*UserInfo, error) {
	url := fmt.Sprintf("%s/user.info?handles=%s", BaseURL, handle)
	resp, err := c.httpClient.Get(url)
	if err != nil {
		return nil, fmt.Errorf("CF API request failed: %w", err)
	}
	defer resp.Body.Close()

	var cfResp CFResponse
	if err := json.NewDecoder(resp.Body).Decode(&cfResp); err != nil {
		return nil, fmt.Errorf("CF API decode failed: %w", err)
	}

	if cfResp.Status != "OK" {
		return nil, fmt.Errorf("CF API error: %s", cfResp.Comment)
	}

	var users []UserInfo
	if err := json.Unmarshal(cfResp.Result, &users); err != nil {
		return nil, fmt.Errorf("CF user parse failed: %w", err)
	}

	if len(users) == 0 {
		return nil, fmt.Errorf("user not found: %s", handle)
	}

	return &users[0], nil
}

// GetSubmissions fetches recent submissions for a user
func (c *Client) GetSubmissions(handle string, count int) ([]map[string]interface{}, error) {
	url := fmt.Sprintf("%s/user.status?handle=%s&from=1&count=%d", BaseURL, handle, count)
	resp, err := c.httpClient.Get(url)
	if err != nil {
		return nil, fmt.Errorf("CF API request failed: %w", err)
	}
	defer resp.Body.Close()

	var cfResp CFResponse
	if err := json.NewDecoder(resp.Body).Decode(&cfResp); err != nil {
		return nil, fmt.Errorf("CF API decode failed: %w", err)
	}

	var submissions []map[string]interface{}
	if err := json.Unmarshal(cfResp.Result, &submissions); err != nil {
		return nil, fmt.Errorf("CF submissions parse failed: %w", err)
	}

	return submissions, nil
}
