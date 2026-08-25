package handler

import (
	"testing"

	"github.com/IDika31/cphub/api/internal/provider/codeforces"
)

// Option text as Codeforces actually prints it, ids included — the point of
// matching on text is that these numbers move when a compiler is updated.
var cfDropdown = []codeforces.Language{
	{ID: "89", Name: "GNU G++23 14.2 (64 bit, msys2)"},
	{ID: "91", Name: "GNU G++20 13.2 (64 bit, winlibs)"},
	{ID: "54", Name: "GNU G++17 7.3.0"},
	{ID: "31", Name: "Python 3.8.10"},
	{ID: "70", Name: "PyPy 3.10 (7.3.15, 64bit)"},
	{ID: "87", Name: "Java 21 64bit"},
	{ID: "55", Name: "Node.js 15.8.0 (64bit)"},
	{ID: "75", Name: "Rust 1.75.0 (2021)"},
}

func TestPickLanguageByAlias(t *testing.T) {
	cases := map[string]string{
		"cpp20":   "91",
		"cpp17":   "54",
		"cpp23":   "89",
		"cpp":     "91", // no version given: prefer the newest alias listed
		"python3": "31",
		"pypy3":   "70",
		"java":    "87",
		"nodejs":  "55",
		"rust":    "75",
	}
	for want, id := range cases {
		got, err := pickLanguage(cfDropdown, want)
		if err != nil {
			t.Errorf("pickLanguage(%q): %v", want, err)
			continue
		}
		if got != id {
			t.Errorf("pickLanguage(%q) = %s, want %s", want, got, id)
		}
	}
}

// A UI that already read /api/cf/languages passes the id straight through.
func TestPickLanguageAcceptsKnownID(t *testing.T) {
	got, err := pickLanguage(cfDropdown, "87")
	if err != nil || got != "87" {
		t.Fatalf("pickLanguage(\"87\") = %q, %v", got, err)
	}
}

// An id the account cannot actually use must fail rather than being sent anyway:
// Codeforces would compile the source as something else entirely.
func TestPickLanguageRejectsUnknownID(t *testing.T) {
	if _, err := pickLanguage(cfDropdown, "9999"); err == nil {
		t.Fatal("an id absent from the dropdown was accepted")
	}
}

func TestPickLanguageFallsBackToDropdownText(t *testing.T) {
	got, err := pickLanguage(cfDropdown, "Rust 1.75.0 (2021)")
	if err != nil || got != "75" {
		t.Fatalf("got %q, %v", got, err)
	}
}

func TestPickLanguageRejectsUnknownName(t *testing.T) {
	if _, err := pickLanguage(cfDropdown, "brainfuck"); err == nil {
		t.Fatal("an unsupported language was accepted")
	}
	if _, err := pickLanguage(cfDropdown, ""); err == nil {
		t.Fatal("empty language was accepted")
	}
}
