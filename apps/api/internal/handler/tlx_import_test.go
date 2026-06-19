package handler

import "testing"

func TestParseTLXURL(t *testing.T) {
	tests := []struct {
		name      string
		input     string
		wantSlug  string
		wantAlias string
		wantErr   bool
	}{
		{
			name:      "standard URL",
			input:     "https://tlx.toki.id/problems/ioi-2024/day1a",
			wantSlug:  "ioi-2024",
			wantAlias: "day1a",
		},
		{
			name:      "URL with trailing slash",
			input:     "https://tlx.toki.id/problems/ioi-2024/day1a/",
			wantSlug:  "ioi-2024",
			wantAlias: "day1a",
		},
		{
			name:      "URL with query string",
			input:     "https://tlx.toki.id/problems/ioi-2024/day1a?tab=editorial",
			wantSlug:  "ioi-2024",
			wantAlias: "day1a",
		},
		{
			name:    "missing alias",
			input:   "https://tlx.toki.id/problems/ioi-2024",
			wantErr: true,
		},
		{
			name:    "wrong path prefix",
			input:   "https://tlx.toki.id/contest/ioi-2024/day1a",
			wantErr: true,
		},
		{
			name:    "not a TLX URL",
			input:   "https://codeforces.com/contest/2233/problem/A",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			slug, alias, err := parseTLXURL(tt.input)
			if tt.wantErr {
				if err == nil {
					t.Errorf("expected error, got slug=%q alias=%q", slug, alias)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if slug != tt.wantSlug {
				t.Errorf("slug = %q, want %q", slug, tt.wantSlug)
			}
			if alias != tt.wantAlias {
				t.Errorf("alias = %q, want %q", alias, tt.wantAlias)
			}
		})
	}
}
