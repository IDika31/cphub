package codeforces

import (
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"

	"github.com/IDika31/cphub/api/internal/model"
	"github.com/google/uuid"
)

// Scraper reads problem statements, which the official API has no method for — so
// this is HTML, from codeforces.com itself.
//
// It has no transport of its own: it borrows WebSession's, which is what gets it
// past the Cloudflare managed challenge when a browser solver is configured, and
// what reports the wall plainly when none is. A statement fetch needs no login, so
// the session is anonymous and short-lived.
type Scraper struct{}

func NewScraper() *Scraper { return &Scraper{} }

// FetchProblem scrapes codeforces.com/problemset/problem/{contestID}/{letter}.
func (s *Scraper) FetchProblem(contestID, letter string) (*model.Problem, error) {
	path := fmt.Sprintf("/problemset/problem/%s/%s", contestID, letter)
	problemID := contestID + strings.ToUpper(letter)

	session, err := NewWebSession()
	if err != nil {
		return nil, err
	}
	html, status, _, err := session.getPage(path)
	if err != nil {
		return nil, fmt.Errorf("CF fetch failed: %w", err)
	}
	if status == http.StatusNotFound {
		return nil, fmt.Errorf("problem %s not found on Codeforces", problemID)
	}
	if isCloudflareWall(html) {
		return nil, fmt.Errorf("problem %s: Cloudflare challenge not cleared%s", problemID, solverHint(session.viaCloudflare))
	}
	// A statement that parsed to nothing means the page was served but was not the
	// problem — a login wall or a redirect — and returning an empty problem would
	// write that emptiness into the database.
	problem := parseHTML(html, problemID, session.Host()+path)
	if problem.Title == "" && problem.Statement == "" {
		return nil, fmt.Errorf("problem %s: page carried no statement (HTTP %d, %d bytes)", problemID, status, len(html))
	}
	return problem, nil
}

// ParseProblemHTML turns a problem page that somebody else fetched into a Problem
// row. It exists because the cheapest way to get a Codeforces statement is not to
// fetch it from the server at all: the user's own browser is already past the
// Cloudflare gate, so the extension reads the page there and posts the HTML here.
// Same parser either way — FetchProblem is this function plus a request.
//
// The two guards are the ones that matter when the bytes come from outside: a
// Cloudflare interstitial and a login wall are both perfectly valid HTML, and writing
// either one into the database would replace a statement with furniture.
func ParseProblemHTML(problemID, pageURL, html string) (*model.Problem, error) {
	if isCloudflareWall(html) {
		return nil, fmt.Errorf("problem %s: the page sent was a Cloudflare challenge, not the statement", problemID)
	}
	problem := parseHTML(html, problemID, pageURL)
	if problem.Title == "" && problem.Statement == "" {
		return nil, fmt.Errorf("problem %s: no statement found in %d bytes of HTML", problemID, len(html))
	}
	return problem, nil
}

func parseHTML(html, problemID, pageURL string) *model.Problem {
	// `.problem-statement` wraps the header, the body, the input/output specs, the
	// samples AND the note. Handing the whole thing over as Statement while also
	// extracting inputSpec/outputSpec/note separately made the editor render the
	// limits and both specs twice.
	statement := extractStatementBody(extractClassDiv(html, "problem-statement"))

	return &model.Problem{
		ID:           uuid.New(),
		Provider:     "codeforces",
		ProblemID:    problemID,
		Title:        extractTitle(html),
		Statement:    statement,
		InputSpec:    extractClassDiv(html, "input-specification"),
		OutputSpec:   extractClassDiv(html, "output-specification"),
		Note:         extractClassDiv(html, "note"),
		ProblemGroup: extractContestName(html, problemID),
		TimeLimit:    extractLimitText(html, "time-limit"),
		MemoryLimit:  extractLimitText(html, "memory-limit"),
		Tags:         extractTags(html),
		Materials:    extractMaterials(html),
		URL:          pageURL,
		TestCases:    extractSampleTests(html),
	}
}

// materialsCaption is the sidebar box Codeforces prints the editorial in. Anchored on
// the caption and the list that follows it, NOT on "every /blog/entry link on the page":
// the same sidebar carries a Recent actions box, so a page-wide sweep would file
// whatever the community happened to post today as this problem's editorial.
var (
	materialsCaption = regexp.MustCompile(`(?i)Contest materials`)
	blogLinkRe       = regexp.MustCompile(`(?is)<a[^>]+href="(/blog/entry/\d+[^"]*)"[^>]*>(.*?)</a>`)
)

// extractMaterials returns the links beside a problem as a JSON array of {title, url},
// or "[]" when the box is absent — which it is for a problem whose round has no
// editorial published yet, and for gym problems.
func extractMaterials(html string) string {
	const empty = "[]"
	at := materialsCaption.FindStringIndex(html)
	if at == nil {
		return empty
	}
	// The list that follows the caption. Bounded by its own </ul> so the extraction
	// cannot run on into the next sidebar box.
	rest := html[at[1]:]
	start := strings.Index(rest, "<ul")
	if start < 0 {
		return empty
	}
	end := strings.Index(rest[start:], "</ul>")
	if end < 0 {
		return empty
	}
	block := rest[start : start+end]

	type material struct {
		Title string `json:"title"`
		URL   string `json:"url"`
	}
	out := make([]material, 0, 4)
	seen := map[string]bool{}
	for _, m := range blogLinkRe.FindAllStringSubmatch(block, -1) {
		url := "https://codeforces.com" + htmlUnescape(m[1])
		title := cleanText(htmlText(m[2]))
		if title == "" || seen[url] {
			continue
		}
		seen[url] = true
		out = append(out, material{Title: title, URL: url})
	}
	if len(out) == 0 {
		return empty
	}
	blob, err := json.Marshal(out)
	if err != nil {
		return empty
	}
	return string(blob)
}

// zoneMarkers are the sections the problem pane renders as its own labelled
// zones, so the statement body must stop before the first of them.
var zoneMarkers = []string{
	`class="input-specification"`,
	`class="output-specification"`,
	`class="sample-tests"`,
	`class="note"`,
}

// extractStatementBody trims a full `.problem-statement` down to just the prose
// body: no header (title and limits are shown from their own fields) and nothing
// from the labelled zones.
func extractStatementBody(ps string) string {
	if ps == "" {
		return ""
	}
	body := ps

	if h := strings.Index(body, `class="header"`); h >= 0 {
		if end := matchingDivEnd(body, h); end > 0 {
			body = body[end:]
		}
	}

	cut := len(body)
	for _, marker := range zoneMarkers {
		if i := strings.Index(body, marker); i >= 0 && i < cut {
			cut = i
		}
	}
	body = body[:cut]

	// The marker sits inside an opening tag, so the cut leaves a dangling "<div".
	if i := strings.LastIndex(body, "<div"); i >= 0 && !strings.Contains(body[i:], ">") {
		body = body[:i]
	}
	return strings.TrimSpace(body)
}

// matchingDivEnd takes an index pointing anywhere inside a <div ...> opening tag
// and returns the index just past its balanced </div>, or -1.
func matchingDivEnd(s string, idxInsideOpenTag int) int {
	open := strings.LastIndex(s[:idxInsideOpenTag], "<div")
	if open < 0 {
		return -1
	}
	gt := strings.Index(s[open:], ">")
	if gt < 0 {
		return -1
	}
	pos := open + gt + 1
	depth := 1
	for depth > 0 && pos < len(s) {
		nextOpen := strings.Index(s[pos:], "<div")
		nextClose := strings.Index(s[pos:], "</div>")
		if nextClose < 0 {
			return -1
		}
		if nextOpen >= 0 && nextOpen < nextClose {
			depth++
			pos += nextOpen + 4
			continue
		}
		depth--
		pos += nextClose + 6
	}
	if depth != 0 {
		return -1
	}
	return pos
}

// extractContestName pulls the contest/round title from the sidebar link that
// points at this problem's contest, so the editor template can stamp
// problemgroup automatically instead of leaving it blank.
func extractContestName(html, problemID string) string {
	m := regexp.MustCompile(`^(\d+)`).FindStringSubmatch(problemID)
	if m == nil {
		return ""
	}
	re := regexp.MustCompile(`<a[^>]+href="/contest/` + m[1] + `"[^>]*>([^<]+)</a>`)
	for _, hit := range re.FindAllStringSubmatch(html, -1) {
		name := strings.TrimSpace(htmlUnescape(hit[1]))
		// Skip navigation links like "Problems" / "Submit" that share the href.
		if len(name) > 6 && !strings.EqualFold(name, "problems") {
			return name
		}
	}
	return ""
}

func htmlUnescape(s string) string {
	s = strings.ReplaceAll(s, "&amp;", "&")
	s = strings.ReplaceAll(s, "&lt;", "<")
	s = strings.ReplaceAll(s, "&gt;", ">")
	s = strings.ReplaceAll(s, "&quot;", "\"")
	s = strings.ReplaceAll(s, "&#39;", "'")
	s = strings.ReplaceAll(s, "&nbsp;", " ")
	return s
}

func extractTitle(html string) string {
	re := regexp.MustCompile(`<div class="title">([^<]+)</div>`)
	m := re.FindStringSubmatch(html)
	if m != nil {
		return strings.TrimSpace(m[1])
	}
	return ""
}

// extractLimitText finds e.g. "1 second" from <div class="time-limit">...<div class="property-title">...</div>1 second</div>
func extractLimitText(html, class string) string {
	idx := strings.Index(html, `class="`+class+`"`)
	if idx < 0 {
		return ""
	}
	after := html[idx:]
	// skip the inner property-title div
	inner := strings.Index(after, "</div>")
	if inner < 0 {
		return ""
	}
	rest := strings.TrimSpace(after[inner+6:])
	end := strings.Index(rest, "</div>")
	if end < 0 {
		return ""
	}
	text := rest[:end]
	text = regexp.MustCompile(`<[^>]+>`).ReplaceAllString(text, "")
	return strings.TrimSpace(text)
}

// extractClassDiv returns innerHTML of the first div matching class, counting nested divs.
func extractClassDiv(html, class string) string {
	marker := `class="` + class + `"`
	start := strings.Index(html, marker)
	if start < 0 {
		return ""
	}
	// Find the `>` that ends the opening tag
	openEnd := strings.Index(html[start:], ">")
	if openEnd < 0 {
		return ""
	}
	content := html[start+openEnd+1:]

	depth := 1
	pos := 0
	for depth > 0 && pos < len(content) {
		nextOpen := strings.Index(content[pos:], "<div")
		nextClose := strings.Index(content[pos:], "</div>")
		if nextClose < 0 {
			break
		}
		if nextOpen >= 0 && nextOpen < nextClose {
			depth++
			pos += nextOpen + 4
		} else {
			depth--
			if depth == 0 {
				return strings.TrimSpace(content[:pos+nextClose])
			}
			pos += nextClose + 6
		}
	}
	return ""
}

func extractSampleTests(html string) []model.TestCase {
	sampleIdx := strings.Index(html, `class="sample-tests"`)
	if sampleIdx < 0 {
		return nil
	}
	sampleHTML := html[sampleIdx:]

	inputRe := regexp.MustCompile(`(?s)<div class="input">.*?<pre[^>]*>(.*?)</pre>`)
	outputRe := regexp.MustCompile(`(?s)<div class="output">.*?<pre[^>]*>(.*?)</pre>`)

	inputs := inputRe.FindAllStringSubmatch(sampleHTML, -1)
	outputs := outputRe.FindAllStringSubmatch(sampleHTML, -1)

	n := len(inputs)
	if len(outputs) < n {
		n = len(outputs)
	}

	cases := make([]model.TestCase, 0, n)
	for i := 0; i < n; i++ {
		cases = append(cases, model.TestCase{
			ID:       uuid.New(),
			Input:    cleanText(inputs[i][1]),
			Output:   cleanText(outputs[i][1]),
			IsSample: true,
			Order:    i,
		})
	}
	return cases
}

func extractTags(html string) string {
	// Codeforces renders a tag as <span class="tag-box" title="Brute force"> brute
	// force </span>. The closer used to be </a> — tags were links — and matching
	// only that returned an empty list for every problem. It went unnoticed because
	// this whole path was unreachable behind Cloudflare until the browser solver
	// landed, so nothing ever got as far as parsing a real page. Both closers are
	// accepted rather than swapped, in case the link form comes back.
	re := regexp.MustCompile(`class="tag-box"[^>]*>\s*([^<]+?)\s*</(?:a|span)>`)
	matches := re.FindAllStringSubmatch(html, -1)
	var tags []string
	for _, m := range matches {
		tag := strings.TrimSpace(m[1])
		// A leading "*" is the difficulty box (*800), not a topic tag.
		if tag != "" && !strings.HasPrefix(tag, "*") {
			tags = append(tags, tag)
		}
	}
	if len(tags) == 0 {
		return "[]"
	}
	b, _ := json.Marshal(tags)
	return string(b)
}

func cleanText(s string) string {
	// CF wraps multi-test inputs in <div> elements
	s = regexp.MustCompile(`(?s)<div[^>]*>`).ReplaceAllString(s, "")
	s = strings.ReplaceAll(s, "</div>", "\n")
	s = regexp.MustCompile(`(?i)<br\s*/?\s*>`).ReplaceAllString(s, "\n")
	s = regexp.MustCompile(`<[^>]+>`).ReplaceAllString(s, "")
	s = strings.ReplaceAll(s, "&amp;", "&")
	s = strings.ReplaceAll(s, "&lt;", "<")
	s = strings.ReplaceAll(s, "&gt;", ">")
	s = strings.ReplaceAll(s, "&quot;", "\"")
	s = strings.ReplaceAll(s, "&#39;", "'")
	return strings.TrimSpace(s)
}
