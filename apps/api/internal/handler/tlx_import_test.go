package handler

import "testing"

func TestParseTLXURL(t *testing.T) {
	tests := []struct {
		name      string
		input     string
		wantHost  string
		wantSlug  string
		wantAlias string
		wantErr   bool
	}{
		{
			name:      "standard URL",
			input:     "https://tlx.toki.id/problems/ioi-2024/day1a",
			wantHost:  "tlx.toki.id",
			wantSlug:  "ioi-2024",
			wantAlias: "day1a",
		},
		{
			name:      "URL with trailing slash",
			input:     "https://tlx.toki.id/problems/ioi-2024/day1a/",
			wantHost:  "tlx.toki.id",
			wantSlug:  "ioi-2024",
			wantAlias: "day1a",
		},
		{
			name:      "URL with query string",
			input:     "https://tlx.toki.id/problems/ioi-2024/day1a?tab=editorial",
			wantHost:  "tlx.toki.id",
			wantSlug:  "ioi-2024",
			wantAlias: "day1a",
		},
		{
			// A self-hosted Judgels serves the identical path, so the host is the
			// only thing that says which instance (and which token) to use.
			name:      "self-hosted instance keeps its host",
			input:     "https://CPC.compfest.id/problems/compfest-18-scpc-penyisihan/H",
			wantHost:  "cpc.compfest.id",
			wantSlug:  "compfest-18-scpc-penyisihan",
			wantAlias: "H",
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
			host, slug, alias, err := parseTLXURL(tt.input)
			if tt.wantErr {
				if err == nil {
					t.Errorf("expected error, got host=%q slug=%q alias=%q", host, slug, alias)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if host != tt.wantHost {
				t.Errorf("host = %q, want %q", host, tt.wantHost)
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
