package codeforces

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"net/url"
	"strings"
)

// bfaa is the constant every Codeforces client sends; ftaa is random per session.
// Both are injected by the site's own JavaScript rather than being form inputs, and
// the server ties the session to the pair, so the same values must accompany every
// later request in that session.
const bfaaConstant = "f1b3f18c715565b589b7823cda7448ce"

type WebAuth struct {
	Ftaa    string         `json:"ftaa"`
	Bfaa    string         `json:"bfaa"`
	Handle  string         `json:"handle"`
	Cookies []StoredCookie `json:"cookies"`
}

type StoredCookie struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

func randomLowerAlnum(n int) string {
	const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789"
	var b strings.Builder
	for i := 0; i < n; i++ {
		idx, err := rand.Int(rand.Reader, big.NewInt(int64(len(alphabet))))
		if err != nil {
			b.WriteByte('a')
			continue
		}
		b.WriteByte(alphabet[idx.Int64()])
	}
	return b.String()
}

// Login signs in with handle (or email) and password. Codeforces has no write API
// and no OAuth of its own, so this is the browser form, submitted verbatim.
func (s *WebSession) Login(handleOrEmail, password string) (string, error) {
	body, err := s.get("/enter")
	if err != nil {
		return "", fmt.Errorf("membuka halaman login: %w", err)
	}
	csrf := csrfRe.FindStringSubmatch(body)
	if csrf == nil {
		return "", fmt.Errorf("csrf token tidak ditemukan di halaman login")
	}

	if s.ftaa == "" {
		s.ftaa = randomLowerAlnum(18)
	}
	s.bfaa = bfaaConstant

	form := url.Values{
		"csrf_token":    {csrf[1]},
		"action":        {"enter"},
		"ftaa":          {s.ftaa},
		"bfaa":          {s.bfaa},
		"handleOrEmail": {handleOrEmail},
		"password":      {password},
		"_tta":          {"176"},
		"remember":      {"on"},
	}
	resp, err := s.postForm("/enter", form)
	if err != nil {
		return "", fmt.Errorf("mengirim form login: %w", err)
	}

	// The site answers a successful login by rendering the page with the handle in
	// a script variable; a failed one keeps the form and adds an error span.
	if m := handleRe.FindStringSubmatch(resp); m != nil && m[1] != "" {
		s.handle = m[1]
		return m[1], nil
	}
	if m := errSpanRe.FindStringSubmatch(resp); m != nil && strings.TrimSpace(m[1]) != "" {
		return "", fmt.Errorf("Codeforces menolak login: %s", strings.TrimSpace(m[1]))
	}
	return "", fmt.Errorf("login gagal — handle/password salah, atau Codeforces mengubah halamannya")
}

// LoggedInHandle reports who the stored session belongs to, by asking the site
// rather than trusting what was saved. Empty means the session expired.
func (s *WebSession) LoggedInHandle() (string, error) {
	body, err := s.get("/enter")
	if err != nil {
		return "", err
	}
	if m := handleRe.FindStringSubmatch(body); m != nil {
		return m[1], nil
	}
	return "", nil
}

func (s *WebSession) postForm(path string, form url.Values) (string, error) {
	// The browser check has to be out of the way before posting: answering it
	// requires a GET, and a POST that lands on the puzzle loses its form data.
	if _, err := s.get(path); err != nil {
		return "", err
	}
	req, err := http.NewRequest(http.MethodPost, s.host+path, strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	setBrowserHeaders(req)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Origin", s.host)
	req.Header.Set("Referer", s.host+path)

	resp, err := s.http.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("%s%s: HTTP %d", s.host, path, resp.StatusCode)
	}
	return string(body), nil
}

// Export packages the session for storage: the cookies plus the ftaa/bfaa pair the
// server associated with them. Passwords are not part of this.
func (s *WebSession) Export() ([]byte, error) {
	u, err := url.Parse(s.host)
	if err != nil {
		return nil, err
	}
	auth := WebAuth{Ftaa: s.ftaa, Bfaa: s.bfaa, Handle: s.handle}
	for _, ck := range s.http.Jar.Cookies(u) {
		auth.Cookies = append(auth.Cookies, StoredCookie{Name: ck.Name, Value: ck.Value})
	}
	return json.Marshal(auth)
}

// Import restores a session saved by Export. A restored session still has to be
// checked with LoggedInHandle: Codeforces expires them on its own schedule.
func (s *WebSession) Import(blob []byte) error {
	var auth WebAuth
	if err := json.Unmarshal(blob, &auth); err != nil {
		return err
	}
	s.ftaa, s.bfaa, s.handle = auth.Ftaa, auth.Bfaa, auth.Handle
	if s.bfaa == "" {
		s.bfaa = bfaaConstant
	}
	cookies := make([]*http.Cookie, 0, len(auth.Cookies))
	for _, ck := range auth.Cookies {
		cookies = append(cookies, &http.Cookie{Name: ck.Name, Value: ck.Value, Path: "/"})
	}
	for _, host := range s.hosts {
		u, err := url.Parse(host)
		if err != nil {
			continue
		}
		s.http.Jar.SetCookies(u, cookies)
	}
	return nil
}
