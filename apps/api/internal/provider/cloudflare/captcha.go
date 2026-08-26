package cloudflare

import (
	"context"
	"fmt"
	"strings"
	"time"
)

// CaptchaKind is what a provider is being asked to solve.
type CaptchaKind string

const (
	TurnstileCaptcha CaptchaKind = "turnstile"
	HCaptcha         CaptchaKind = "hcaptcha"
	ReCaptcha        CaptchaKind = "recaptcha"
)

// CaptchaProvider is a third-party solving service. cloudscraper ships six; the
// two below cover the same ground, and the interface is the whole extension point
// for the rest — a provider is one HTTP conversation.
type CaptchaProvider interface {
	Name() string
	// Solve returns the token to submit with the challenge form.
	Solve(ctx context.Context, kind CaptchaKind, pageURL, siteKey string) (string, error)
}

// CaptchaOptions configures the provider, mirroring cloudscraper's captcha dict.
type CaptchaOptions struct {
	// Provider is "2captcha", "anticaptcha", or "return_response" to have the
	// challenge page handed back unsolved (cloudscraper's escape hatch for callers
	// that want to look at it themselves).
	Provider string
	APIKey   string
	// ClientKey is anticaptcha's name for the same thing; either field works.
	ClientKey string
	// Timeout bounds the whole solve, polling included. Zero means 180s, the
	// window cloudscraper allows.
	Timeout time.Duration
	// PollInterval is how often the job is checked. Zero means 5s.
	PollInterval time.Duration
}

func (o CaptchaOptions) key() string {
	if o.APIKey != "" {
		return o.APIKey
	}
	return o.ClientKey
}

func (o CaptchaOptions) timeout() time.Duration {
	if o.Timeout == 0 {
		return 180 * time.Second
	}
	return o.Timeout
}

func (o CaptchaOptions) poll() time.Duration {
	if o.PollInterval == 0 {
		return 5 * time.Second
	}
	return o.PollInterval
}

// ErrReturnResponse is what the return_response provider answers with, so the
// caller gets the challenge page back instead of an attempted solve.
var ErrReturnResponse = fmt.Errorf("captcha provider is return_response: page returned unsolved")

// NewCaptchaProvider builds the configured provider. An unknown name is an error
// rather than a silent no-op: a typo in a provider name would otherwise look like
// "the site has no captcha".
func NewCaptchaProvider(o CaptchaOptions) (CaptchaProvider, error) {
	switch strings.ToLower(strings.TrimSpace(o.Provider)) {
	case "":
		return nil, nil
	case "return_response":
		return returnResponse{}, nil
	case "2captcha", "twocaptcha":
		if o.key() == "" {
			return nil, fmt.Errorf("2captcha needs an api_key")
		}
		return &twoCaptcha{opts: o}, nil
	case "anticaptcha", "anti-captcha":
		if o.key() == "" {
			return nil, fmt.Errorf("anticaptcha needs a clientKey")
		}
		return &antiCaptcha{opts: o}, nil
	default:
		return nil, fmt.Errorf("unknown captcha provider %q (have: 2captcha, anticaptcha, return_response)", o.Provider)
	}
}

type returnResponse struct{}

func (returnResponse) Name() string { return "return_response" }
func (returnResponse) Solve(context.Context, CaptchaKind, string, string) (string, error) {
	return "", ErrReturnResponse
}

// pollUntil runs check until it returns a token, the deadline passes, or it fails.
// Both providers work the same way — submit a job, then wait — so the waiting is
// written once.
func pollUntil(ctx context.Context, every, within time.Duration, check func(context.Context) (string, error)) (string, error) {
	deadline := time.Now().Add(within)
	// The first look is deliberately delayed: no service has an answer instantly,
	// and an immediate poll only spends quota.
	for {
		select {
		case <-time.After(every):
		case <-ctx.Done():
			return "", ctx.Err()
		}
		token, err := check(ctx)
		if err != nil {
			return "", err
		}
		if token != "" {
			return token, nil
		}
		if time.Now().After(deadline) {
			return "", fmt.Errorf("captcha not solved within %s", within)
		}
	}
}
