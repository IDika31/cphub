package handler

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/IDika31/cphub/api/internal/model"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type CFConfig struct {
	ClientID     string
	ClientSecret string
	RedirectURL  string
}

func HandleCodeforcesCallback(db *gorm.DB, cfg CFConfig) fiber.Handler {
	return func(c *fiber.Ctx) error {
		code := c.Query("code")
		if code == "" {
			return c.Status(400).JSON(fiber.Map{"error": "Missing authorization code"})
		}

		userIDStr := c.Locals("userId")
		if userIDStr == nil {
			return c.Status(401).JSON(fiber.Map{"error": "Not authenticated"})
		}
		userID, _ := uuid.Parse(userIDStr.(string))

		// Step 1: Exchange code for access token
		token, err := exchangeCFToken(code, cfg)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{
				"error":   "Failed to exchange token",
				"detail":  err.Error(),
			})
		}

		// Step 2: Fetch user info from CF API
		cfUser, err := fetchCFUserInfo(token)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{
				"error":   "Failed to fetch Codeforces user info",
				"detail":  err.Error(),
			})
		}

		// Step 3: Create or update LinkedAccount
		now := time.Now()
		var account model.LinkedAccount
		result := db.Where("user_id = ? AND provider = ?", userID, "codeforces").First(&account)

		account.UserID = userID
		account.Provider = "codeforces"
		account.ProviderUserID = cfUser.Handle
		account.Handle = cfUser.Handle
		account.AccessToken = token
		account.Rating = cfUser.Rating
		account.MaxRating = cfUser.MaxRating
		account.AvatarURL = cfUser.Avatar
		account.IsConnected = true

		if result.Error != nil {
			account.ID = uuid.New()
			account.LinkedAt = now
			if err := db.Create(&account).Error; err != nil {
				return c.Status(500).JSON(fiber.Map{"error": "Failed to save account"})
			}
		} else {
			if err := db.Save(&account).Error; err != nil {
				return c.Status(500).JSON(fiber.Map{"error": "Failed to update account"})
			}
		}

		// Redirect back to frontend connections page
		return c.Redirect("http://localhost:3000/connections?linked=codeforces", 302)
	}
}

type CFUserInfo struct {
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

func exchangeCFToken(code string, cfg CFConfig) (string, error) {
	data := url.Values{
		"grant_type":    {"authorization_code"},
		"code":          {code},
		"client_id":     {cfg.ClientID},
		"client_secret": {cfg.ClientSecret},
		"redirect_uri":  {cfg.RedirectURL},
	}

	resp, err := http.Post(
		"https://codeforces.com/oauth/token",
		"application/x-www-form-urlencoded",
		strings.NewReader(data.Encode()),
	)
	if err != nil {
		return "", fmt.Errorf("token request failed: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	// CF token response is URL-encoded: access_token=xxx&expires_in=3600
	values, err := url.ParseQuery(string(body))
	if err != nil {
		return "", fmt.Errorf("failed to parse token response: %s", string(body))
	}

	token := values.Get("access_token")
	if token == "" {
		return "", fmt.Errorf("no access_token in response: %s", string(body))
	}

	return token, nil
}

func fetchCFUserInfo(token string) (*CFUserInfo, error) {
	// CF API requires API key+secret for user.info, but OAuth token works too
	url := fmt.Sprintf(
		"https://codeforces.com/api/user.info?oauth_token=%s",
		token,
	)

	resp, err := http.Get(url)
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

	var users []CFUserInfo
	if err := json.Unmarshal(cfResp.Result, &users); err != nil {
		return nil, fmt.Errorf("CF user parse failed: %w", err)
	}

	if len(users) == 0 {
		return nil, fmt.Errorf("no user found for this token")
	}

	return &users[0], nil
}
