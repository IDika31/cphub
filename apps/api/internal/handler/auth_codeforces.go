package handler

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/IDika31/cphub/api/internal/database"
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
		state := c.Query("state")

		if code == "" {
			errType := c.Query("error", "")
			errDesc := c.Query("error_description", "")
			log.Printf("[cf_oauth] authorization denied: error=%s desc=%s", errType, errDesc)
			return c.Redirect("http://localhost:3000/connections?linked=codeforces&error="+errType, 302)
		}

		if state == "" {
			return c.Status(400).JSON(fiber.Map{"error": "Missing state parameter"})
		}

		// Look up userID from Redis using state
		redisCtx := c.Context()
		userIDStr, err := database.Cache.Get(redisCtx, "cf_oauth:"+state).Result()
		if err != nil {
			return c.Status(400).JSON(fiber.Map{
				"error":  "Invalid or expired state",
				"detail": err.Error(),
			})
		}
		// Clean up the state key
		database.Cache.Del(redisCtx, "cf_oauth:"+state)

		userID, _ := uuid.Parse(userIDStr)

		// Step 1: Exchange code for access_token + id_token (OIDC)
		accessToken, idToken, err := exchangeCFToken(code, cfg)
		if err != nil {
			log.Printf("[cf_oauth] token exchange failed: %v", err)
			return c.Redirect("http://localhost:3000/connections?linked=codeforces&error=token_exchange", 302)
		}

		// Step 2: Try OIDC id_token first, fallback to CF API
		cfUser, err := parseCFIDToken(idToken)
		if err != nil {
			log.Printf("[cf_oauth] id_token parse failed, trying API: %v", err)
			cfUser, err = fetchCFUserInfo(accessToken)
			if err != nil {
				log.Printf("[cf_oauth] user info fetch failed: %v", err)
				return c.Redirect("http://localhost:3000/connections?linked=codeforces&error=user_fetch", 302)
			}
		}

		// Step 3: Create or update LinkedAccount
		now := time.Now()
		var account model.LinkedAccount
		result := db.Where("user_id = ? AND provider = ?", userID, "codeforces").First(&account)

		if result.Error != nil {
			account = model.LinkedAccount{
				ID:             uuid.New(),
				UserID:         userID,
				Provider:       "codeforces",
				ProviderUserID: cfUser.Handle,
				Handle:         cfUser.Handle,
				AccessToken:    accessToken,
				Rating:         cfUser.Rating,
				MaxRating:      cfUser.MaxRating,
				AvatarURL:      cfUser.Avatar,
				IsConnected:    true,
				LinkedAt:       now,
			}
			if err := db.Create(&account).Error; err != nil {
				log.Printf("[cf_oauth] failed to create account: %v", err)
				return c.Redirect("http://localhost:3000/connections?linked=codeforces&error=db_error", 302)
			}
		} else {
			account.AccessToken = accessToken
			account.Handle = cfUser.Handle
			account.Rating = cfUser.Rating
			account.MaxRating = cfUser.MaxRating
			account.AvatarURL = cfUser.Avatar
			account.IsConnected = true
			if err := db.Save(&account).Error; err != nil {
				log.Printf("[cf_oauth] failed to update account: %v", err)
				return c.Redirect("http://localhost:3000/connections?linked=codeforces&error=db_error", 302)
			}
		}

		log.Printf("[cf_oauth] linked Codeforces account: %s (user=%s)", cfUser.Handle, userIDStr)
		return c.Redirect("http://localhost:3000/connections?linked=codeforces&success=1", 302)
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

func exchangeCFToken(code string, cfg CFConfig) (accessToken string, idToken string, err error) {
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
		return "", "", fmt.Errorf("token request failed: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	log.Printf("[cf_oauth] token response: %s", string(body))

	values, err := url.ParseQuery(string(body))
	if err != nil {
		return "", "", fmt.Errorf("failed to parse token response: %s", string(body))
	}

	accessToken = values.Get("access_token")
	idToken = values.Get("id_token")
	if accessToken == "" {
		return "", "", fmt.Errorf("no access_token in response: %s", string(body))
	}

	return accessToken, idToken, nil
}

// parseIDToken extracts CF user info from OIDC id_token (JWT without signature verification)
func parseCFIDToken(idToken string) (*CFUserInfo, error) {
	if idToken == "" {
		return nil, fmt.Errorf("empty id_token")
	}

	// JWT: header.payload.signature — we just need the payload
	parts := strings.Split(idToken, ".")
	if len(parts) < 2 {
		return nil, fmt.Errorf("invalid JWT format")
	}

	// Base64 decode the payload
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		// Try standard base64
		payload, err = base64.StdEncoding.DecodeString(parts[1])
		if err != nil {
			return nil, fmt.Errorf("failed to decode id_token payload: %w", err)
		}
	}

	var claims struct {
		Handle  string `json:"handle"`
		Rating  int    `json:"rating"`
		Avatar  string `json:"picture"` // OIDC standard claim
		Email   string `json:"email"`
	}
	if err := json.Unmarshal(payload, &claims); err != nil {
		return nil, fmt.Errorf("failed to parse id_token claims: %w", err)
	}

	if claims.Handle == "" {
		return nil, fmt.Errorf("no handle in id_token claims")
	}

	return &CFUserInfo{
		Handle: claims.Handle,
		Rating: claims.Rating,
		Avatar: claims.Avatar,
	}, nil
}

func fetchCFUserInfo(token string) (*CFUserInfo, error) {
	url := fmt.Sprintf("https://codeforces.com/api/user.info?oauth_token=%s", token)
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
