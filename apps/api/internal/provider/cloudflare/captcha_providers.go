package cloudflare

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

// twoCaptcha talks to 2captcha's in.php/res.php pair: submit a job, poll for the
// answer. Kept on the plain stdlib client — the solving service is not the thing
// being fingerprinted.
type twoCaptcha struct {
	opts CaptchaOptions
	http http.Client
	// base is the API root, overridden only by tests: a provider whose endpoints
	// are string literals cannot be exercised without reaching the real service.
	base string
}

func (t *twoCaptcha) endpoint(path string) string {
	if t.base != "" {
		return t.base + path
	}
	return "https://2captcha.com" + path
}

func (t *twoCaptcha) Name() string { return "2captcha" }

var twoCaptchaMethods = map[CaptchaKind]string{
	TurnstileCaptcha: "turnstile",
	HCaptcha:         "hcaptcha",
	ReCaptcha:        "userrecaptcha",
}

type twoCaptchaReply struct {
	Status  int    `json:"status"`
	Request string `json:"request"`
}

func (t *twoCaptcha) Solve(ctx context.Context, kind CaptchaKind, pageURL, siteKey string) (string, error) {
	method, ok := twoCaptchaMethods[kind]
	if !ok {
		return "", fmt.Errorf("2captcha cannot solve %q", kind)
	}
	submit := url.Values{
		"key":     {t.opts.key()},
		"method":  {method},
		"sitekey": {siteKey},
		"pageurl": {pageURL},
		"json":    {"1"},
	}
	var job twoCaptchaReply
	if err := t.call(ctx, t.endpoint("/in.php"), submit, &job); err != nil {
		return "", err
	}
	if job.Status != 1 {
		return "", fmt.Errorf("2captcha refused the job: %s", job.Request)
	}

	get := url.Values{
		"key":    {t.opts.key()},
		"action": {"get"},
		"id":     {job.Request},
		"json":   {"1"},
	}
	return pollUntil(ctx, t.opts.poll(), t.opts.timeout(), func(ctx context.Context) (string, error) {
		var res twoCaptchaReply
		if err := t.call(ctx, t.endpoint("/res.php"), get, &res); err != nil {
			return "", err
		}
		if res.Status == 1 {
			return res.Request, nil
		}
		// NOT_READY is the expected in-progress answer; anything else is a real
		// failure and must not be waited out.
		if strings.Contains(res.Request, "NOT_READY") {
			return "", nil
		}
		return "", fmt.Errorf("2captcha failed: %s", res.Request)
	})
}

func (t *twoCaptcha) call(ctx context.Context, endpoint string, form url.Values, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := t.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("%s: HTTP %d", endpoint, resp.StatusCode)
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

// antiCaptcha talks to anti-captcha.com's createTask/getTaskResult pair.
type antiCaptcha struct {
	opts CaptchaOptions
	http http.Client
	base string
}

func (a *antiCaptcha) endpoint(path string) string {
	if a.base != "" {
		return a.base + path
	}
	return "https://api.anti-captcha.com" + path
}

func (a *antiCaptcha) Name() string { return "anticaptcha" }

var antiCaptchaTypes = map[CaptchaKind]string{
	TurnstileCaptcha: "TurnstileTaskProxyless",
	HCaptcha:         "HCaptchaTaskProxyless",
	ReCaptcha:        "RecaptchaV2TaskProxyless",
}

type antiCaptchaReply struct {
	ErrorID          int    `json:"errorId"`
	ErrorDescription string `json:"errorDescription"`
	TaskID           int64  `json:"taskId"`
	Status           string `json:"status"`
	Solution         struct {
		Token              string `json:"token"`
		GRecaptchaResponse string `json:"gRecaptchaResponse"`
	} `json:"solution"`
}

func (a *antiCaptchaReply) token() string {
	if a.Solution.Token != "" {
		return a.Solution.Token
	}
	return a.Solution.GRecaptchaResponse
}

func (a *antiCaptcha) Solve(ctx context.Context, kind CaptchaKind, pageURL, siteKey string) (string, error) {
	taskType, ok := antiCaptchaTypes[kind]
	if !ok {
		return "", fmt.Errorf("anticaptcha cannot solve %q", kind)
	}
	create := map[string]any{
		"clientKey": a.opts.key(),
		"task": map[string]any{
			"type":       taskType,
			"websiteURL": pageURL,
			"websiteKey": siteKey,
		},
	}
	var job antiCaptchaReply
	if err := a.call(ctx, a.endpoint("/createTask"), create, &job); err != nil {
		return "", err
	}
	if job.ErrorID != 0 {
		return "", fmt.Errorf("anticaptcha refused the job: %s", job.ErrorDescription)
	}

	query := map[string]any{"clientKey": a.opts.key(), "taskId": job.TaskID}
	return pollUntil(ctx, a.opts.poll(), a.opts.timeout(), func(ctx context.Context) (string, error) {
		var res antiCaptchaReply
		if err := a.call(ctx, a.endpoint("/getTaskResult"), query, &res); err != nil {
			return "", err
		}
		switch {
		case res.ErrorID != 0:
			return "", fmt.Errorf("anticaptcha failed: %s", res.ErrorDescription)
		case res.Status == "ready":
			if tok := res.token(); tok != "" {
				return tok, nil
			}
			return "", fmt.Errorf("anticaptcha reported ready with no token")
		default:
			return "", nil // still processing
		}
	})
}

func (a *antiCaptcha) call(ctx context.Context, endpoint string, payload map[string]any, out any) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(string(body)))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := a.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("%s: HTTP %d", endpoint, resp.StatusCode)
	}
	return json.NewDecoder(resp.Body).Decode(out)
}
