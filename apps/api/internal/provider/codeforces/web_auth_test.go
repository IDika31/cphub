package codeforces

import "testing"

// The header box exactly as m1.codeforces.com renders it for a signed-in user.
// Captured 2026-08-26: the handle is bare text, there is no profile link and no
// `handle = "..."` script variable anywhere on the page — which is why the earlier
// success check reported a working login as "wrong password".
const loggedInMirrorHeader = `    <header>
        <div class="enter-or-register-box">
                    IDika
                |
                <a class="logout" href="/logout">Logout</a>
        </div>
        <nav><ul><li><a class="_active" href="/">Contests</a></li></ul></nav>
    </header>`

// The same box before signing in.
const anonymousMirrorHeader = `    <header>
        <div class="enter-or-register-box">
            <a href="/enter?back=%2F">Enter</a>
            |
            <a href="/register">Register</a>
        </div>
    </header>
    <form method="post" action=""><input type="text" name="handleOrEmail"/></form>`

// The main host wraps the handle in a profile link instead.
const loggedInMainHeader = `<div class="enter-or-register-box">
    <a href="/profile/IDika" class="rated-user user-blue">IDika</a>
    | <a href="/logout?csrf_token=abc">Logout</a>
</div>`

// An anonymous page that mentions other people. Nothing here may be read as a
// session: the sidebar links to profiles and carries data-handle attributes.
const anonymousWithSidebar = `<div class="enter-or-register-box">
    <a href="/enter">Enter</a> | <a href="/register">Register</a>
</div>
<div class="recent-actions">
    <a href="/profile/tourist" class="rated-user" data-handle="tourist">tourist</a>
    <script>var handle = "tourist";</script>
</div>`

func TestLoggedInHandle(t *testing.T) {
	cases := []struct {
		name string
		body string
		want string
	}{
		{"mirror, signed in", loggedInMirrorHeader, "IDika"},
		{"mirror, anonymous", anonymousMirrorHeader, ""},
		{"main host, signed in", loggedInMainHeader, "IDika"},
		{"anonymous page naming other users", anonymousWithSidebar, ""},
		{"empty body", "", ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := loggedInHandle(tc.body); got != tc.want {
				t.Fatalf("loggedInHandle() = %q, want %q", got, tc.want)
			}
		})
	}
}

// TestErrorSpanExtraction pins the markup Codeforces actually sends for a rejected
// form, in both shapes seen so far.
func TestErrorSpanExtraction(t *testing.T) {
	cases := map[string]string{
		`<div class="subscription-row error ">Invalid handle/email or password</div>`:       "Invalid handle/email or password",
		`<span class="error for__password">Wrong password</span>`:                           "Wrong password",
		`<div class="error-message">You have submitted exactly the same code before.</div>`: "You have submitted exactly the same code before.",
	}
	for body, want := range cases {
		m := errSpanRe.FindStringSubmatch(body)
		if m == nil {
			t.Errorf("no match in %s", body)
			continue
		}
		if got := htmlText(m[1]); got != want {
			t.Errorf("extracted %q, want %q", got, want)
		}
	}
	// A page with no error element must not produce a phantom message.
	if errSpanRe.MatchString(loggedInMirrorHeader) {
		t.Error("a logged-in page must not look like an error page")
	}
}
