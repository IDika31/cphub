package codeforces

import (
	"strings"
	"testing"
)

// The page the extension is supposed to send: a real statement, read from a browser
// that was already past the Cloudflare gate.
const browserStatementHTML = `<html><head><title>Problem 4A - Codeforces</title></head><body>
<div class="problem-statement">
  <div class="header">
    <div class="title">A. Watermelon</div>
    <div class="time-limit"><div class="property-title">time limit per test</div>1 second</div>
    <div class="memory-limit"><div class="property-title">memory limit per test</div>64 megabytes</div>
  </div>
  <div><p>One hot summer day Pete and his friend Billy decided to buy a watermelon.</p></div>
  <div class="input-specification"><div class="section-title">Input</div><p>The first line contains w.</p></div>
  <div class="output-specification"><div class="section-title">Output</div><p>Print YES or NO.</p></div>
  <div class="sample-tests"><div class="sample-test">
    <div class="input"><div class="title">Input</div><pre>8</pre></div>
    <div class="output"><div class="title">Output</div><pre>YES</pre></div>
  </div></div>
</div></body></html>`

func TestParseProblemHTMLAcceptsABrowserReadPage(t *testing.T) {
	problem, err := ParseProblemHTML("4A", "https://codeforces.com/problemset/problem/4/A", browserStatementHTML)
	if err != nil {
		t.Fatalf("ParseProblemHTML: %v", err)
	}
	if !strings.Contains(problem.Title, "Watermelon") {
		t.Errorf("title = %q, want it to name the problem", problem.Title)
	}
	if problem.Statement == "" {
		t.Error("statement empty — the whole point of the upload")
	}
	if len(problem.TestCases) != 1 {
		t.Errorf("%d samples parsed, want 1", len(problem.TestCases))
	}
}

// Both of these are valid HTML that is not a statement, and both used to be storable:
// writing either one over a problem replaces its statement with furniture.
func TestParseProblemHTMLRejectsPagesThatAreNotStatements(t *testing.T) {
	cases := map[string]string{
		"cloudflare interstitial": `<html><head><title>Just a moment...</title></head>
			<body><div id="challenge-platform"></div></body></html>`,
		"login wall": `<html><body><form><input name="handleOrEmail"><input name="password"></form></body></html>`,
		"empty":      `<html><body></body></html>`,
	}
	for name, html := range cases {
		if _, err := ParseProblemHTML("4A", "https://codeforces.com/problemset/problem/4/A", html); err == nil {
			t.Errorf("%s: err = nil, want a refusal", name)
		}
	}
}
