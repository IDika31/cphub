package codeforces

import (
	"encoding/json"
	"strings"
	"testing"
)

// The sidebar shape a Codeforces problem page carries: a materials box holding the
// editorial, and — further down the same sidebar — a Recent actions box full of
// unrelated blog links. The second box is the reason extraction is anchored on the
// caption and the list under it rather than on every /blog/entry link on the page.
const problemSidebarHTML = `<html><body>
<div class="problem-statement"><div><p>statement</p></div></div>
<div id="sidebar">
  <div class="roundbox sidebox">
    <div class="caption titled">&rarr; Contest materials</div>
    <ul>
      <li><a href="/blog/entry/104088">Codeforces Round 700 Editorial</a> <span>tutorial</span></li>
      <li><a href="/blog/entry/104001?locale=en">Announcement</a></li>
    </ul>
  </div>
  <div class="roundbox sidebox">
    <div class="caption titled">&rarr; Recent actions</div>
    <ul>
      <li><a href="/blog/entry/156278">a dark truth about codeforces</a></li>
      <li><a href="/blog/entry/156267">Solved Count Custom Filter Required</a></li>
    </ul>
  </div>
</div></body></html>`

type material struct {
	Title string `json:"title"`
	URL   string `json:"url"`
}

func parseMaterials(t *testing.T, raw string) []material {
	t.Helper()
	var out []material
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		t.Fatalf("materials is not JSON: %v (%q)", err, raw)
	}
	return out
}

func TestExtractMaterialsTakesOnlyTheMaterialsBox(t *testing.T) {
	got := parseMaterials(t, extractMaterials(problemSidebarHTML))
	if len(got) != 2 {
		t.Fatalf("%d materials, want 2: %+v", len(got), got)
	}
	if got[0].Title != "Codeforces Round 700 Editorial" {
		t.Errorf("first title = %q", got[0].Title)
	}
	if got[0].URL != "https://codeforces.com/blog/entry/104088" {
		t.Errorf("first url = %q, want an absolute codeforces.com link", got[0].URL)
	}
	for _, m := range got {
		// Recent actions lives in the same sidebar; filing today's community post as
		// this problem's editorial is the failure this test exists to catch.
		if strings.Contains(m.Title, "dark truth") || strings.Contains(m.URL, "156278") {
			t.Errorf("Recent actions leaked into the materials: %+v", m)
		}
	}
}

// A round whose editorial is not published yet has no box at all, and gym problems
// never get one. Neither is an error, and neither may write anything over what a
// previous upload already stored.
func TestExtractMaterialsIsEmptyWithoutTheBox(t *testing.T) {
	for name, html := range map[string]string{
		"no sidebar":      `<html><body><div class="problem-statement">x</div></body></html>`,
		"box but no list": `<html><div class="caption titled">&rarr; Contest materials</div></html>`,
		"only recent actions": `<html><div class="caption titled">&rarr; Recent actions</div>
			<ul><li><a href="/blog/entry/1">post</a></li></ul></html>`,
	} {
		if got := extractMaterials(html); got != "[]" {
			t.Errorf("%s: materials = %q, want []", name, got)
		}
	}
}

// The statement upload is where these arrive, so the parser the endpoint calls has to
// carry them through.
func TestParseProblemHTMLCarriesMaterials(t *testing.T) {
	problem, err := ParseProblemHTML("4A", "https://codeforces.com/problemset/problem/4/A", problemSidebarHTML)
	if err != nil {
		t.Fatalf("ParseProblemHTML: %v", err)
	}
	if got := parseMaterials(t, problem.Materials); len(got) != 2 {
		t.Errorf("%d materials on the parsed problem, want 2", len(got))
	}
}
