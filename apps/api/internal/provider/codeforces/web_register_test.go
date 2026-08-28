package codeforces

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

// registrationForm is the page Codeforces serves at /contestRegistration/<id> while the
// window is open: a csrf token in a script tag, and a form of hidden fields to replay.
const registrationForm = `<html><script>var csrf='d2428ca21c8b65cd070fea259cda2610';</script>` +
	`<form method="post"><input type="hidden" name="action" value="registerForContest">` +
	`<input type="hidden" name="csrf_token" value="d2428ca21c8b65cd070fea259cda2610"></form></html>`

// A registration Codeforces took sends the browser off the form. That redirect is the
// success marker; nothing about the reply body says "registered" in so many words.
func TestRegisterContestTreatsTheRedirectAsSuccess(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost:
			http.Redirect(w, r, "/contests", http.StatusFound)
		case r.URL.Path == "/contests":
			w.Write([]byte(`<html><tr data-contestId="2258"></tr></html>`))
		default:
			w.Write([]byte(registrationForm))
		}
	}))
	defer srv.Close()

	already, err := newTestSession(t, srv).RegisterContest(2258)
	if err != nil {
		t.Fatalf("RegisterContest: %v", err)
	}
	if already {
		t.Error("already = true, want false — this was a fresh registration")
	}
}

// The case the old code got wrong. Codeforces serves the form again, with no error element
// anywhere, and nothing was registered. Reading "no complaint" as success filed a
// registration that did not exist and hid the button that would have fixed it.
func TestRegisterContestRefusesToAssumeSuccess(t *testing.T) {
	var posts int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			posts++
		}
		w.Write([]byte(registrationForm))
	}))
	defer srv.Close()

	_, err := newTestSession(t, srv).RegisterContest(2258)
	if err == nil {
		t.Fatal("err = nil, want a complaint: the form came back and nothing was registered")
	}
	if !strings.Contains(err.Error(), "masih tampil") {
		t.Errorf("err = %v, want it to say the form was served again", err)
	}
	if posts != 1 {
		t.Errorf("posted %d times, want 1 — a failed registration must not be retried blindly", posts)
	}
}

// Codeforces answers some accepted registrations by re-rendering the same path rather than
// redirecting. Asking the page again is what tells that apart from a refusal.
func TestRegisterContestConfirmsByAskingAgain(t *testing.T) {
	var posted bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			posted = true
			w.Write([]byte(registrationForm))
			return
		}
		if posted {
			w.Write([]byte(`<html><div>You have already registered for the contest</div></html>`))
			return
		}
		w.Write([]byte(registrationForm))
	}))
	defer srv.Close()

	already, err := newTestSession(t, srv).RegisterContest(2258)
	if err != nil {
		t.Fatalf("RegisterContest: %v", err)
	}
	// already reports the state BEFORE this call, and before it the account was not in.
	if already {
		t.Error("already = true, want false — the account was not registered until this call")
	}
}

// An account already in the round is a success, not a failure, and the caller shows a
// different message for it.
func TestRegisterContestReportsAnExistingRegistration(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`<html><div class="datatable">You have already registered for the contest</div></html>`))
	}))
	defer srv.Close()

	already, err := newTestSession(t, srv).RegisterContest(2258)
	if err != nil {
		t.Fatalf("RegisterContest: %v", err)
	}
	if !already {
		t.Error("already = false, want true — Codeforces said the account is in")
	}
}

// Codeforces' own wording beats any guess CPHub could make about why it refused.
func TestRegisterContestSurfacesCodeforcesRefusal(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			w.Write([]byte(`<html><div class="subscription-row error ">Registration is closed</div></html>`))
			return
		}
		w.Write([]byte(registrationForm))
	}))
	defer srv.Close()

	_, err := newTestSession(t, srv).RegisterContest(2258)
	if err == nil || !strings.Contains(err.Error(), "Registration is closed") {
		t.Fatalf("err = %v, want Codeforces' own message", err)
	}
}

// realRegistrationPage is /contestRegistration/2258 as Codeforces served it on
// 2026-08-28, trimmed to the form. Two things here are not guesses and were both missed
// by an earlier version of this code: takePartAs is a pre-checked RADIO rather than a
// hidden field, and _tta carries the page's own value.
const realRegistrationPage = `<html><body>` +
	`<span style='display:none;' class='csrf-token' data-csrf='2d0e868e174446aab8fd4e668a362f7e'>&nbsp;</span>` +
	`<form class="contestRegistration" method="post" action="" enctype="multipart/form-data">` +
	`<input type='hidden' name='csrf_token' value='2d0e868e174446aab8fd4e668a362f7e'/>` +
	`<input type="hidden" name="action" value="formSubmitted"/>` +
	`<input type="hidden" name="backUrl" value=""/>` +
	`<textarea readonly="true" class="terms" id="registrationTerms">The registration confirms that you:</textarea>` +
	`<label><input type="radio" id="takePartAsIndividualInput" name="takePartAs" value="personal" checked="checked"/>` +
	` as individual participant</label>` +
	`<input class="submit" type="submit" value="Register"/>` +
	`<input type="hidden" name="_tta" value="689"/></form></body></html>`

// The registration Codeforces accepts carries takePartAs. Its own form JS refuses to
// submit without it, and a POST that omits it says nothing about how the account enters.
func TestRegisterContestReplaysTheCheckedRadio(t *testing.T) {
	var posted url.Values
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			if err := r.ParseForm(); err != nil {
				t.Errorf("parsing the posted form: %v", err)
			}
			posted = r.PostForm
			http.Redirect(w, r, "/contests", http.StatusFound)
			return
		}
		if r.URL.Path == "/contests" {
			w.Write([]byte(`<html>Codeforces.showMessage("You have been successfully registered");</html>`))
			return
		}
		w.Write([]byte(realRegistrationPage))
	}))
	defer srv.Close()

	already, err := newTestSession(t, srv).RegisterContest(2258)
	if err != nil {
		t.Fatalf("RegisterContest: %v", err)
	}
	if already {
		t.Error("already = true, want false")
	}
	if got := posted.Get("takePartAs"); got != "personal" {
		t.Errorf("takePartAs = %q, want \"personal\" — the pre-checked radio was not replayed", got)
	}
	if got := posted.Get("action"); got != "formSubmitted" {
		t.Errorf("action = %q, want \"formSubmitted\"", got)
	}
	// The page computes this; a constant of ours in its place is a fingerprint that does
	// not match the form it came from.
	if got := posted.Get("_tta"); got != "689" {
		t.Errorf("_tta = %q, want \"689\" — the page's own value must win", got)
	}
	if got := posted.Get("csrf_token"); got != "2d0e868e174446aab8fd4e668a362f7e" {
		t.Errorf("csrf_token = %q", got)
	}
}

// Codeforces' own words on the page it lands on, which is the marker that does not depend
// on watching where the redirect went.
func TestRegisterContestReadsTheSuccessMessage(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			// Same path, no redirect: only the message says it worked.
			w.Write([]byte(`<html>Codeforces.showMessage("You have been successfully registered");</html>`))
			return
		}
		w.Write([]byte(realRegistrationPage))
	}))
	defer srv.Close()

	already, err := newTestSession(t, srv).RegisterContest(2258)
	if err != nil {
		t.Fatalf("RegisterContest: %v", err)
	}
	if already {
		t.Error("already = true, want false — this registration was made by this call")
	}
}

// The bytes Codeforces actually sends, not the DOM a browser shows. Its template mixes
// quote styles — csrf_token in single quotes, the rest in double — and _tta is absent
// entirely because signForms() adds that from JavaScript after the page loads.
const rawRegistrationPage = `<html><body>` +
	`<span style='display:none;' class='csrf-token' data-csrf='2d0e868e174446aab8fd4e668a362f7e'>&nbsp;</span>` +
	`<form class="contestRegistration" method="post" action="" enctype="multipart/form-data">` +
	`<input type='hidden' name='csrf_token' value='2d0e868e174446aab8fd4e668a362f7e'/>` +
	`<input type="hidden" name="action" value="formSubmitted"/>` +
	`<input type="hidden" name="backUrl" value=""/>` +
	`<label><input type="radio" id="takePartAsIndividualInput" name="takePartAs" value="personal" checked="checked"/>` +
	` as individual participant</label></form></body></html>`

func TestRegisterContestReadsSingleQuotedMarkup(t *testing.T) {
	var posted url.Values
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			if err := r.ParseForm(); err != nil {
				t.Errorf("parsing the posted form: %v", err)
			}
			posted = r.PostForm
			http.Redirect(w, r, "/contests", http.StatusFound)
			return
		}
		if r.URL.Path == "/contests" {
			w.Write([]byte(`<html>Codeforces.showMessage("You have been successfully registered");</html>`))
			return
		}
		w.Write([]byte(rawRegistrationPage))
	}))
	defer srv.Close()

	if _, err := newTestSession(t, srv).RegisterContest(2258); err != nil {
		t.Fatalf("RegisterContest: %v", err)
	}
	for field, want := range map[string]string{
		"action":     "formSubmitted",
		"takePartAs": "personal",
		// No _tta in the served HTML, so the fallback stands rather than the field going
		// missing.
		"_tta": "176",
	} {
		if got := posted.Get(field); got != want {
			t.Errorf("%s = %q, want %q", field, got, want)
		}
	}
	if _, ok := posted["backUrl"]; !ok {
		t.Error("backUrl missing — an empty value is still a field the form carries")
	}
}
