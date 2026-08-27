package codeforces

import (
	"net/http"
	"net/http/httptest"
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
