package tlx

import (
	"fmt"
	"net/http"
	"time"
)

// TLX TOKI does not have a public API.
// All data is fetched via browser extension scraping.
// This package handles verification of TLX sessions.

type Client struct {
	httpClient *http.Client
}

func NewClient() *Client {
	return &Client{
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}
}

// VerifySessionToken checks if a TLX session token is valid
// by attempting to access the user's profile page
func (c *Client) VerifySessionToken(token string) (bool, error) {
	req, err := http.NewRequest("GET", "https://tlx.toki.id/api/v2/user", nil)
	if err != nil {
		return false, fmt.Errorf("TLX request failed: %w", err)
	}
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", token))

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return false, fmt.Errorf("TLX API request failed: %w", err)
	}
	defer resp.Body.Close()

	return resp.StatusCode == 200, nil
}
