package codeforces

import (
	"strings"
	"testing"
)

// Codeforces renders one .input/.output pair per Example block. A problem with
// three examples must yield three test cases — grabbing only the first was the
// bug that made multi-example problems import a single sample.
const multiExampleHTML = `
<div class="problem-statement">
<div class="sample-tests">
  <div class="section-title">Examples</div>
  <div class="sample-test">
    <div class="input"><div class="title">Input</div><pre>3<br/>1 2 3</pre></div>
    <div class="output"><div class="title">Output</div><pre>6</pre></div>
    <div class="input"><div class="title">Input</div><pre>1<br/>5</pre></div>
    <div class="output"><div class="title">Output</div><pre>5</pre></div>
    <div class="input"><div class="title">Input</div><pre>2<br/>-1 1</pre></div>
    <div class="output"><div class="title">Output</div><pre>0</pre></div>
  </div>
</div>
</div>`

// The "t test cases" layout is a single stdin whose lines are wrapped in divs.
// It is one sample, not one per line.
const multiTestLineHTML = `
<div class="sample-tests">
  <div class="sample-test">
    <div class="input"><div class="title">Input</div><pre><div class="test-example-line test-example-line-0">2</div><div class="test-example-line test-example-line-1">1 2</div><div class="test-example-line test-example-line-2">3 4</div></pre></div>
    <div class="output"><div class="title">Output</div><pre><div>3</div><div>7</div></pre></div>
  </div>
</div>`

func TestExtractSampleTestsKeepsEveryExample(t *testing.T) {
	cases := extractSampleTests(multiExampleHTML)
	if len(cases) != 3 {
		t.Fatalf("got %d test cases, want 3", len(cases))
	}

	want := [][2]string{
		{"3\n1 2 3", "6"},
		{"1\n5", "5"},
		{"2\n-1 1", "0"},
	}
	for i, w := range want {
		if cases[i].Input != w[0] {
			t.Errorf("case %d input = %q, want %q", i, cases[i].Input, w[0])
		}
		if cases[i].Output != w[1] {
			t.Errorf("case %d output = %q, want %q", i, cases[i].Output, w[1])
		}
		if !cases[i].IsSample {
			t.Errorf("case %d should be marked as a sample", i)
		}
		if cases[i].Order != i {
			t.Errorf("case %d order = %d, want %d", i, cases[i].Order, i)
		}
	}
}

func TestExtractSampleTestsMultiTestBlockIsOneCase(t *testing.T) {
	cases := extractSampleTests(multiTestLineHTML)
	if len(cases) != 1 {
		t.Fatalf("got %d test cases, want 1", len(cases))
	}
	if cases[0].Input != "2\n1 2\n3 4" {
		t.Errorf("input = %q, want the lines joined by newlines", cases[0].Input)
	}
	// Output must be the real expected output, never a copy of the input.
	if cases[0].Output == cases[0].Input {
		t.Error("output must not mirror the input")
	}
	if cases[0].Output != "3\n7" {
		t.Errorf("output = %q, want %q", cases[0].Output, "3\n7")
	}
}

func TestExtractSampleTestsNoSamples(t *testing.T) {
	if got := extractSampleTests("<div class=problem-statement></div>"); got != nil {
		t.Errorf("got %v, want nil when the page has no sample-tests block", got)
	}
}

// A full .problem-statement carries the header, the body, both specs, the
// samples and the note. Passing all of it through as Statement while also
// extracting the specs separately rendered the limits and specs twice.
const fullStatementHTML = `<div class="problem-statement">` +
	`<div class="header"><div class="title">D. Bermuda Rectangle</div>` +
	`<div class="time-limit"><div class="property-title">time limit per test</div>2 seconds</div>` +
	`<div class="memory-limit"><div class="property-title">memory limit per test</div>256 megabytes</div>` +
	`</div>` +
	`<div><p>The Beaver is swimming.</p><div class="nested">deep</div><p>More prose.</p></div>` +
	`<div class="input-specification"><p>Two integers.</p></div>` +
	`<div class="output-specification"><p>One integer.</p></div>` +
	`<div class="sample-tests"><div class="sample-test">` +
	`<div class="input"><pre>1</pre></div><div class="output"><pre>2</pre></div>` +
	`</div></div>` +
	`<div class="note"><p>See figure.</p></div>` +
	`</div>` +
	`<div class="roundbox sidebox"><table class="rtable"><tbody><tr>` +
	`<th class="left"><a href="/contest/2257">Codeforces Round 1099 (Div. 2)</a></th>` +
	`</tr></tbody></table></div>`

func TestParseHTMLDoesNotDuplicateSections(t *testing.T) {
	p := parseHTML(fullStatementHTML, "2257D", "https://codeforces.com/problemset/problem/2257/D")

	if p.Statement == "" {
		t.Fatal("statement body must not be empty")
	}
	for _, leaked := range []string{
		"time limit per test", "memory limit per test",
		"Two integers", "One integer", "See figure", "sample-test",
	} {
		if strings.Contains(p.Statement, leaked) {
			t.Errorf("statement leaked %q — the pane renders that in its own zone", leaked)
		}
	}
	// The prose, including nested divs, must survive.
	for _, want := range []string{"The Beaver is swimming", "deep", "More prose"} {
		if !strings.Contains(p.Statement, want) {
			t.Errorf("statement lost %q", want)
		}
	}

	if p.InputSpec == "" || !strings.Contains(p.InputSpec, "Two integers") {
		t.Errorf("inputSpec = %q", p.InputSpec)
	}
	if p.OutputSpec == "" || !strings.Contains(p.OutputSpec, "One integer") {
		t.Errorf("outputSpec = %q", p.OutputSpec)
	}
	if !strings.Contains(p.Note, "See figure") {
		t.Errorf("note = %q", p.Note)
	}
	if p.TimeLimit != "2 seconds" || p.MemoryLimit != "256 megabytes" {
		t.Errorf("limits = %q / %q", p.TimeLimit, p.MemoryLimit)
	}
	// problemgroup is stamped into the editor template, so it must come from the
	// page rather than being left blank.
	if p.ProblemGroup != "Codeforces Round 1099 (Div. 2)" {
		t.Errorf("problemGroup = %q, want the contest name", p.ProblemGroup)
	}
	if len(p.TestCases) != 1 {
		t.Errorf("test cases = %d, want 1", len(p.TestCases))
	}
}
