package codeforces

import (
	"crypto/rand"
	"crypto/sha512"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"sync"
	"time"
)

// API is the official read-only Codeforces API.
//
// Every HTML page on codeforces.com now sits behind a Cloudflare challenge — a
// plain client gets 403 "Just a moment", verified from both a desktop and the
// production host — while codeforces.com/api still answers normally. So every
// read CPHub needs (problemset, contests, submissions, rating) comes from here
// instead of from scraping, and only the things the API has no method for
// (statement HTML, submitting, registering) still need a browser session.
type API struct {
	http   *http.Client
	key    string
	secret string
	// base is BaseURL in production; tests point it at an httptest server.
	base string
}

func NewAPI(key, secret string) *API {
	return &API{
		http:   &http.Client{Timeout: 30 * time.Second},
		key:    key,
		secret: secret,
		base:   BaseURL,
	}
}

// Codeforces rates the API at one request per two seconds and answers 403 with
// "Call limit exceeded" past that. The gate is package-level, not per-client, so
// two handlers syncing at once still queue behind each other rather than getting
// the whole account throttled.
var apiGate struct {
	mu   sync.Mutex
	last time.Time
}

const apiMinInterval = 2100 * time.Millisecond

func (a *API) call(method string, params url.Values, out interface{}) error {
	if params == nil {
		params = url.Values{}
	}
	// An apiKey/apiSecret pair (codeforces.com/settings/api) is only needed for
	// data private to the user. Anonymous calls see everything public, so the
	// signature is added when configured and skipped otherwise.
	if a.key != "" && a.secret != "" {
		a.sign(method, params)
	}

	apiGate.mu.Lock()
	if wait := apiMinInterval - time.Since(apiGate.last); wait > 0 {
		time.Sleep(wait)
	}
	apiGate.last = time.Now()
	apiGate.mu.Unlock()

	endpoint := a.base + "/" + method
	if q := params.Encode(); q != "" {
		endpoint += "?" + q
	}
	resp, err := a.http.Get(endpoint)
	if err != nil {
		return fmt.Errorf("cf api %s: %w", method, err)
	}
	defer resp.Body.Close()

	var env struct {
		Status  string          `json:"status"`
		Comment string          `json:"comment"`
		Result  json.RawMessage `json:"result"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&env); err != nil {
		// A Cloudflare interstitial is HTML, not JSON: say so plainly instead of
		// reporting a confusing JSON syntax error.
		if resp.StatusCode == http.StatusForbidden {
			return fmt.Errorf("cf api %s: HTTP 403 (blocked, not JSON)", method)
		}
		return fmt.Errorf("cf api %s: HTTP %d, bad JSON: %w", method, resp.StatusCode, err)
	}
	if env.Status != "OK" {
		return fmt.Errorf("cf api %s: %s", method, env.Comment)
	}
	if out == nil {
		return nil
	}
	if err := json.Unmarshal(env.Result, out); err != nil {
		return fmt.Errorf("cf api %s: result parse: %w", method, err)
	}
	return nil
}

// sign implements the apiSig scheme: six random digits, then the SHA-512 of
// "<rand>/<method>?<params sorted by key then value>#<secret>", with the random
// prefix repeated in front of the digest.
func (a *API) sign(method string, params url.Values) {
	params.Set("apiKey", a.key)
	params.Set("time", fmt.Sprintf("%d", time.Now().Unix()))

	pairs := make([]string, 0, len(params))
	for k, vs := range params {
		for _, v := range vs {
			pairs = append(pairs, url.QueryEscape(k)+"="+url.QueryEscape(v))
		}
	}
	sort.Strings(pairs)

	nonce := randomDigits(6)
	sum := sha512.Sum512([]byte(nonce + "/" + method + "?" + strings.Join(pairs, "&") + "#" + a.secret))
	params.Set("apiSig", nonce+hex.EncodeToString(sum[:]))
}

func randomDigits(n int) string {
	var b strings.Builder
	for i := 0; i < n; i++ {
		d, err := rand.Int(rand.Reader, big.NewInt(10))
		if err != nil {
			b.WriteByte('0')
			continue
		}
		b.WriteString(d.String())
	}
	return b.String()
}
