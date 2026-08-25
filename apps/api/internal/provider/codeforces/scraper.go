package codeforces

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/IDika31/cphub/api/internal/model"
	"github.com/google/uuid"
)

type Scraper struct {
	httpClient *http.Client
}

func NewScraper() *Scraper {
	return &Scraper{
		httpClient: &http.Client{Timeout: 15 * time.Second},
	}
}

// FetchProblem scrapes codeforces.com/problemset/problem/{contestID}/{letter}.
func (s *Scraper) FetchProblem(contestID, letter string) (*model.Problem, error) {
	url := fmt.Sprintf("https://codeforces.com/problemset/problem/%s/%s", contestID, letter)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("CF fetch failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == 404 {
		return nil, fmt.Errorf("problem %s%s not found on Codeforces", contestID, letter)
	}
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("Codeforces returned HTTP %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read body failed: %w", err)
	}

	html := string(body)
	if strings.Contains(html, "Just a moment") || strings.Contains(html, "cf-browser-verification") {
		return nil, fmt.Errorf("Cloudflare challenge encountered — try again later")
	}

	problemID := contestID + strings.ToUpper(letter)
	return parseHTML(html, problemID, url), nil
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
		URL:          pageURL,
		TestCases:    extractSampleTests(html),
	}
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
	re := regexp.MustCompile(`class="tag-box"[^>]*>\s*([^<]+?)\s*</a>`)
	matches := re.FindAllStringSubmatch(html, -1)
	var tags []string
	for _, m := range matches {
		tag := strings.TrimSpace(m[1])
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
