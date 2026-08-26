package cloudflare

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

// A legacy IUAM page, shaped like the ones Cloudflare served: the answer is built
// out of !+[] arithmetic, the hostname is derived through the DOM (which the solver
// must strip), and the reply is timed by the page's own setTimeout.
//
// The constant folds to 4 + 11 = 15, so the answer is 15 + len(hostname).
const iuamChallengePage = `<!DOCTYPE html>
<html><body>
<form id="challenge-form" action="/cdn-cgi/l/chk_jschl?__cf_chl_jschl_tk__=tok" method="POST">
<input type="hidden" name="r" value="R-VALUE"/>
<input type="hidden" name="jschl_vc" value="VC-VALUE"/>
<input type="hidden" name="pass" value="PASS-VALUE"/>
</form>
<script type="text/javascript">
  setTimeout(function(){
    var s,t,o,p,b,r,e,a,k,i,n,g,f, ZbCk={"kMbxq":+((!+[]+!![]+!![])+(+!![]))};
    t = document.createElement('div');
    t.innerHTML = "<a href='/'>x</a>";
    t = t.firstChild.href;
    ZbCk.kMbxq += (+((+!![]+[])+(+!![])));
    a.value = ZbCk.kMbxq + t.length;
  }, 100);
</script>
</body></html>`

func wantAnswer(host string) string {
	return fmt.Sprintf("%.10f", float64(15+len(host)))
}

func TestSolveIUAM(t *testing.T) {
	got, err := solveIUAM(iuamChallengePage, "example.com")
	if err != nil {
		t.Fatalf("solveIUAM: %v", err)
	}
	if want := wantAnswer("example.com"); got != want {
		t.Fatalf("answer = %q, want %q", got, want)
	}
	if _, err := solveIUAM(realPage, "example.com"); err == nil {
		t.Error("a page with no challenge script must be reported, not answered with nonsense")
	}
}

func TestFormInputsAndDelay(t *testing.T) {
	inputs := formInputs(iuamChallengePage)
	for name, want := range map[string]string{"r": "R-VALUE", "jschl_vc": "VC-VALUE", "pass": "PASS-VALUE"} {
		if inputs[name] != want {
			t.Errorf("input %s = %q, want %q", name, inputs[name], want)
		}
	}
	c, err := New(Options{IUAMDelay: 9 * time.Second})
	if err != nil {
		t.Fatal(err)
	}
	// The page's own timing wins over the configured default, because answering
	// early is what Cloudflare rejects.
	if got := c.iuamDelayFor(iuamChallengePage); got != 100*time.Millisecond {
		t.Errorf("delay = %v, want the page's 100ms", got)
	}
	if got := c.iuamDelayFor(realPage); got != 9*time.Second {
		t.Errorf("fallback delay = %v, want the configured 9s", got)
	}
}

// TestDoSolvesIUAM walks the whole loop: challenge, solve, submit, clearance
// cookie, retry, real page.
func TestDoSolvesIUAM(t *testing.T) {
	var (
		submitted string
		agent     string
		hits      int
	)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Server", "cloudflare")
		w.Header().Set("cf-ray", "test-ray-1")
		if r.URL.Path == "/cdn-cgi/l/chk_jschl" {
			r.ParseForm()
			submitted = r.PostForm.Get("jschl_answer")
			if r.PostForm.Get("jschl_vc") != "VC-VALUE" || r.PostForm.Get("pass") != "PASS-VALUE" {
				http.Error(w, "form fields not replayed", http.StatusBadRequest)
				return
			}
			http.SetCookie(w, &http.Cookie{Name: "cf_clearance", Value: "granted", Path: "/"})
			http.Redirect(w, r, "/", http.StatusFound)
			return
		}
		hits++
		agent = r.Header.Get("User-Agent")
		if ck, err := r.Cookie("cf_clearance"); err == nil && ck.Value == "granted" {
			w.Write([]byte(realPage))
			return
		}
		w.Header().Set("cf-mitigated", "challenge")
		w.WriteHeader(http.StatusServiceUnavailable)
		w.Write([]byte(iuamChallengePage))
	}))
	defer srv.Close()

	c, err := New(Options{Browser: Chrome, Stealth: StealthOptions{Disabled: true}})
	if err != nil {
		t.Fatal(err)
	}
	body, err := c.Get(context.Background(), srv.URL+"/")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if !strings.Contains(body, "Watermelon") {
		t.Fatalf("expected the real page, got %.120q", body)
	}
	host := strings.TrimPrefix(srv.URL, "http://")
	if want := wantAnswer(strings.Split(host, ":")[0]); submitted != want {
		t.Errorf("jschl_answer = %q, want %q", submitted, want)
	}
	if want := c.Browser().Headers["User-Agent"]; agent != want {
		t.Errorf("browser headers not applied: server saw %q, client sends %q", agent, want)
	}
	// Three visits, as a browser would make: the challenge, the redirect the
	// answer lands on, and the re-sent original request.
	if hits != 3 {
		t.Errorf("page fetched %d times, want 3 (challenge, redirect, retry)", hits)
	}
}

type fakeSolver struct {
	calls int
	kind  Challenge
}

func (f *fakeSolver) Solve(_ context.Context, _ *url.URL, kind Challenge, _ string) ([]*http.Cookie, error) {
	f.calls++
	f.kind = kind
	return []*http.Cookie{{Name: "cf_clearance", Value: "granted", Path: "/"}}, nil
}

// TestManagedChallengeNeedsSolver pins the honest behaviour: without a Solver a
// managed challenge is an error that says so, and with one the cookies it returns
// are used for the retry.
func TestManagedChallengeNeedsSolver(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Server", "cloudflare")
		w.Header().Set("cf-ray", "test-ray-2")
		if ck, err := r.Cookie("cf_clearance"); err == nil && ck.Value == "granted" {
			w.Write([]byte(realPage))
			return
		}
		w.Header().Set("cf-mitigated", "challenge")
		w.WriteHeader(http.StatusForbidden)
		w.Write([]byte(managedBody))
	}))
	defer srv.Close()

	bare, err := New(Options{MaxAttempts: 2, Stealth: StealthOptions{Disabled: true}})
	if err != nil {
		t.Fatal(err)
	}
	_, err = bare.Get(context.Background(), srv.URL+"/")
	if !errors.Is(err, ErrNeedsBrowser) {
		t.Fatalf("want ErrNeedsBrowser, got %v", err)
	}
	var chErr *ChallengeError
	if !errors.As(err, &chErr) || chErr.Kind != Managed || chErr.RayID != "test-ray-2" {
		t.Fatalf("error should carry the gate and ray: %v", err)
	}

	solver := &fakeSolver{}
	withSolver, err := New(Options{Solver: solver, Stealth: StealthOptions{Disabled: true}})
	if err != nil {
		t.Fatal(err)
	}
	body, err := withSolver.Get(context.Background(), srv.URL+"/")
	if err != nil {
		t.Fatalf("Get with solver: %v", err)
	}
	if !strings.Contains(body, "Watermelon") || solver.calls != 1 || solver.kind != Managed {
		t.Fatalf("solver path wrong: calls=%d kind=%v body=%.60q", solver.calls, solver.kind, body)
	}
}
