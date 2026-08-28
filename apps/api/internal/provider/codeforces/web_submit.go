package codeforces

import (
	"fmt"
	"net/url"
	"regexp"
	"strconv"
	"strings"
)

var (
	// The submit form's language dropdown. Codeforces renumbers programTypeId
	// whenever it updates a compiler, so the ids are read from the page instead of
	// being carried as a table that silently rots.
	langOptionRe = regexp.MustCompile(`(?s)<option value="(\d+)"[^>]*>(.*?)</option>`)
	langSelectRe = regexp.MustCompile(`(?s)<select[^>]+name="programTypeId".*?</select>`)
	// Both quote styles, because Codeforces' raw HTML mixes them: its own template
	// emits <input type='hidden' name='csrf_token' …/> in single quotes while the rest
	// of the page uses double. A browser's DOM hides that; this client reads the bytes.
	hiddenInputRe = regexp.MustCompile(`<input[^>]+type=['"]hidden['"][^>]*>`)
	// Radios and checkboxes the page pre-selected. The registration form's own
	// "Take part: as individual participant" is one of these:
	//   <input type="radio" id="takePartAsIndividualInput" name="takePartAs"
	//          value="personal" checked="checked">
	// and Codeforces' form JS refuses to submit without it, so replaying only the
	// hidden inputs sent a registration missing the one field that says how to enter.
	checkedInputRe = regexp.MustCompile(`<input[^>]+checked[^>]*>`)
	attrRe         = regexp.MustCompile(`([\w-]+)=(?:"([^"]*)"|'([^']*)')`)
	successMsgRe   = regexp.MustCompile(`(?s)Codeforces\.showMessage\("(.*?)"\)`)
)

type Language struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// LanguageOptions lists what the account may submit in. It doubles as a session
// check: the dropdown only renders for a logged-in user.
func (s *WebSession) LanguageOptions(contestID int) ([]Language, error) {
	path := fmt.Sprintf("/contest/%d/submit", contestID)
	body, status, landed, err := s.getPage(path)
	if err != nil {
		return nil, err
	}
	block := langSelectRe.FindString(body)
	if block == "" {
		return nil, s.describeMissingForm(path, landed, body, status)
	}
	var langs []Language
	for _, m := range langOptionRe.FindAllStringSubmatch(block, -1) {
		name := strings.TrimSpace(htmlText(m[2]))
		if name == "" {
			continue
		}
		langs = append(langs, Language{ID: m[1], Name: name})
	}
	if len(langs) == 0 {
		return nil, fmt.Errorf("tidak ada opsi bahasa terbaca")
	}
	return langs, nil
}

// Submit sends a solution. Every problemset problem belongs to a contest, so the
// contest form is the single path used for both — /problemset/submit wants a
// different field name for no gain.
//
// programTypeID must come from LanguageOptions: guessing it is how a submission
// ends up compiled as the wrong language.
func (s *WebSession) Submit(contestID int, problemIndex, programTypeID, source string) error {
	path := fmt.Sprintf("/contest/%d/submit", contestID)
	body, status, landed, err := s.getPage(path)
	if err != nil {
		return err
	}
	csrf := csrfRe.FindStringSubmatch(body)
	if csrf == nil {
		return s.describeMissingForm(path, landed, body, status)
	}

	form := url.Values{
		"csrf_token":            {csrf[1]},
		"ftaa":                  {s.ftaa},
		"bfaa":                  {s.bfaa},
		"action":                {"submitSolutionFormSubmitted"},
		"submittedProblemIndex": {strings.ToUpper(problemIndex)},
		"programTypeId":         {programTypeID},
		"contestId":             {strconv.Itoa(contestID)},
		"source":                {source},
		"tabSize":               {"4"},
		"_tta":                  {"594"},
		"sourceCodeConfirmed":   {"true"},
	}
	// The token travels in the query string as well as the body, exactly as the
	// site's own form does.
	resp, err := s.postForm(path+"?csrf_token="+csrf[1], form)
	if err != nil {
		return err
	}
	return submitOutcome(resp)
}

// submitOutcome reads the page Codeforces answers with. An error span is the
// authoritative failure signal — it carries "You have submitted exactly the same
// code before" and every compile-time rejection.
func submitOutcome(resp string) error {
	if m := errSpanRe.FindStringSubmatch(resp); m != nil {
		if msg := strings.TrimSpace(htmlText(m[1])); msg != "" {
			return fmt.Errorf("Codeforces menolak submit: %s", msg)
		}
	}
	// A successful submit redirects to the "my submissions" table.
	if strings.Contains(resp, "submitted successfully") ||
		strings.Contains(resp, "id=\"submissions\"") ||
		strings.Contains(resp, "status-frame-datatable") {
		return nil
	}
	if m := successMsgRe.FindStringSubmatch(resp); m != nil {
		return fmt.Errorf("Codeforces menjawab: %s", strings.TrimSpace(m[1]))
	}
	return fmt.Errorf("hasil submit tidak bisa dipastikan — halaman balasan tidak dikenali")
}

// RegisterContest signs the account up for a contest. The form's own hidden inputs
// are replayed rather than guessed, because the field set differs between an
// ordinary round and one with "extra registration", and a wrong guess registers
// nothing while looking like it worked.
//
// The bool reports that the account was ALREADY registered before this call. It is
// worth separating from a fresh registration: both mean "you are in", but only one is
// something this call did, and the caller shows the user a different message for each.
// It is also the only way CPHub learns about a registration made directly on
// codeforces.com, since no read API exposes registration state.
func (s *WebSession) RegisterContest(contestID int) (alreadyRegistered bool, err error) {
	path := fmt.Sprintf("/contestRegistration/%d", contestID)
	body, status, landed, err := s.getPage(path)
	if err != nil {
		return false, err
	}
	if registeredAlreadyRe.MatchString(body) {
		return true, nil
	}
	csrf := csrfRe.FindStringSubmatch(body)
	if csrf == nil {
		return false, s.describeMissingForm(path, landed, body, status)
	}

	form := url.Values{
		"csrf_token": {csrf[1]},
		"ftaa":       {s.ftaa},
		"bfaa":       {s.bfaa},
	}
	for name, value := range formFields(body) {
		if _, taken := form[name]; !taken {
			form.Set(name, value)
		}
	}
	// _tta is computed by Codeforces' own signForms() and INJECTED BY ITS JAVASCRIPT, so
	// it is in the browser's DOM (measured at 689 on the registration page) and absent
	// from the HTML this client reads. The page's value therefore wins where a real
	// browser captured it, and the constant carries the scripted case.
	if form.Get("_tta") == "" {
		form.Set("_tta", "176")
	}
	resp, landedPost, err := s.postFormPage(path, form)
	if err != nil {
		return false, err
	}
	// A race with the user registering in their own browser lands here, and it is a
	// success rather than a failure: the account is in either way.
	if registeredAlreadyRe.MatchString(resp) {
		return true, nil
	}
	if m := errSpanRe.FindStringSubmatch(resp); m != nil {
		if msg := strings.TrimSpace(htmlText(m[1])); msg != "" {
			return false, fmt.Errorf("Codeforces menolak registrasi: %s", msg)
		}
	}
	// Success is asserted from a positive marker from here on, never from the absence of
	// an error element. This used to end in `return false, nil`, which meant any reply
	// without a recognised complaint counted as registered: CPHub then filed a
	// registration, the contest list stopped offering the button, and the user found out
	// they were not in the round when it started.
	//
	// Codeforces says so in as many words on the page it redirects to — measured against
	// contest 2258:
	//   Codeforces.showMessage("You have been successfully registered");
	if registeredNowRe.MatchString(resp) {
		return false, nil
	}
	// And it takes a registration by sending the browser off the form, so a reply from any
	// other path is the second marker. Kept alongside the message because the wording is
	// localised while the redirect is not.
	if landedPost != "" && landedPost != path {
		return false, nil
	}
	// Still on the form. Ask the page itself rather than assume either way.
	confirm, status, landed, cErr := s.getPage(path)
	if cErr != nil {
		return false, fmt.Errorf("registrasi terkirim tapi hasilnya tidak bisa dipastikan: %w", cErr)
	}
	if registeredAlreadyRe.MatchString(confirm) {
		return false, nil
	}
	if csrfRe.MatchString(confirm) {
		return false, fmt.Errorf("Codeforces tidak mencatat registrasi — form %s masih tampil setelah dikirim", path)
	}
	return false, s.describeMissingForm(path, landed, confirm, status)
}

// registeredNowRe is what Codeforces says on the page it lands on after taking a
// registration. Exact wording, measured, so it cannot be confused with the "already
// registered" case the caller reports differently.
var registeredNowRe = regexp.MustCompile(`(?i)You have been successfully registered`)

// registeredAlreadyRe matches the several ways Codeforces says "you are in this one".
// The wording differs between an ordinary round and a contest with extra registration,
// so this is deliberately loose rather than one exact sentence.
var registeredAlreadyRe = regexp.MustCompile(`(?i)You have already registered|already registered for the contest|You are already registered`)

// formFields collects what a browser would have sent from the page's own inputs: every
// hidden field, plus every radio or checkbox the page arrived with already selected.
//
// Hidden-only was not enough. Measured on /contestRegistration/2258, the form is
// csrf_token, action, backUrl, _tta — all hidden — AND takePartAs, a pre-checked radio.
// A POST without takePartAs is a registration that says nothing about how the account
// means to enter.
func formFields(body string) map[string]string {
	out := map[string]string{}
	collect := func(tags []string) {
		for _, tag := range tags {
			attrs := map[string]string{}
			for _, m := range attrRe.FindAllStringSubmatch(tag, -1) {
				// Whichever quote style matched; an empty value reads the same either way.
				value := m[2]
				if value == "" {
					value = m[3]
				}
				attrs[m[1]] = value
			}
			if n := attrs["name"]; n != "" {
				out[n] = attrs["value"]
			}
		}
	}
	collect(hiddenInputRe.FindAllString(body, -1))
	collect(checkedInputRe.FindAllString(body, -1))
	return out
}

func htmlText(s string) string {
	s = regexp.MustCompile(`<[^>]*>`).ReplaceAllString(s, "")
	r := strings.NewReplacer("&amp;", "&", "&lt;", "<", "&gt;", ">", "&quot;", `"`, "&#39;", "'", "&nbsp;", " ")
	return strings.TrimSpace(r.Replace(s))
}
