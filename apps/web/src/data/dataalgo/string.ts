import type { Algo } from "./types";

const algos: Algo[] = [
  {
    id: "string-hashing",
    name: "Polynomial String Hashing",
    category: "string",
    level: "intermediate",
    complexity: "O(n) build, O(1) per substring",
    tags: ["hashing", "substring", "comparison"],
    summary:
      "Prefix hashes let you compare any two substrings in constant time. Two independent moduli (or one 61-bit modulus) make collisions negligible against non-adaptive tests.",
    usage: "Hash h(s); if (h.get(l1, r1) == h.get(l2, r2)) ...",
    variants:
      "Randomise the base per run to defend against anti-hash tests; hash both directions to test palindromes.",
    code: String.raw`struct Hash {
    static const long long M1 = 1000000007, M2 = 998244353;
    long long B1, B2;
    vector<long long> h1, h2, p1, p2;

    explicit Hash(const string &s) {
        static mt19937_64 rng(chrono::steady_clock::now().time_since_epoch().count());
        B1 = 131 + rng() % 100 * 2;
        B2 = 137 + rng() % 100 * 2;
        int n = s.size();
        h1.assign(n + 1, 0); h2.assign(n + 1, 0);
        p1.assign(n + 1, 1); p2.assign(n + 1, 1);
        for (int i = 0; i < n; i++) {
            h1[i + 1] = (h1[i] * B1 + s[i]) % M1;
            h2[i + 1] = (h2[i] * B2 + s[i]) % M2;
            p1[i + 1] = p1[i] * B1 % M1;
            p2[i + 1] = p2[i] * B2 % M2;
        }
    }

    pair<long long,long long> get(int l, int r) const {        // inclusive
        long long a = (h1[r + 1] - h1[l] * p1[r - l + 1]) % M1;
        long long b = (h2[r + 1] - h2[l] * p2[r - l + 1]) % M2;
        if (a < 0) a += M1;
        if (b < 0) b += M2;
        return {a, b};
    }
};`,
  },
  {
    id: "kmp",
    name: "KMP / Prefix Function",
    category: "string",
    level: "intermediate",
    complexity: "O(n + m)",
    tags: ["kmp", "prefix function", "matching"],
    summary:
      "pi[i] is the longest proper border of the prefix ending at i. It gives linear-time substring search, period detection and the automaton behind many string DPs.",
    usage: "auto pi = prefix_function(s); auto hits = kmp_search(text, pat);",
    variants:
      "Smallest period of s is n - pi[n-1] when it divides n. Building the KMP automaton makes DP over 'positions in the pattern' O(n * 26).",
    code: String.raw`vector<int> prefix_function(const string &s) {
    int n = s.size();
    vector<int> pi(n, 0);
    for (int i = 1; i < n; i++) {
        int j = pi[i - 1];
        while (j > 0 && s[i] != s[j]) j = pi[j - 1];
        if (s[i] == s[j]) j++;
        pi[i] = j;
    }
    return pi;
}

vector<int> kmp_search(const string &text, const string &pat) {
    string s = pat + '\x01' + text;
    vector<int> pi = prefix_function(s), res;
    int m = pat.size();
    for (int i = m + 1; i < (int)s.size(); i++)
        if (pi[i] == m) res.push_back(i - 2 * m);      // start index in text
    return res;
}`,
  },
  {
    id: "z-function",
    name: "Z-Function",
    category: "string",
    level: "intermediate",
    complexity: "O(n)",
    tags: ["z function", "matching", "prefix"],
    summary:
      "z[i] is the length of the longest common prefix of s and its suffix starting at i. Equivalent power to KMP and often easier to reason about for counting problems.",
    usage: "auto z = z_function(pat + sep + text);",
    code: String.raw`vector<int> z_function(const string &s) {
    int n = s.size(), l = 0, r = 0;
    vector<int> z(n, 0);
    for (int i = 1; i < n; i++) {
        if (i < r) z[i] = min(r - i, z[i - l]);
        while (i + z[i] < n && s[z[i]] == s[i + z[i]]) z[i]++;
        if (i + z[i] > r) { l = i; r = i + z[i]; }
    }
    return z;
}`,
  },
  {
    id: "manacher",
    name: "Manacher (all palindromes)",
    category: "string",
    level: "advanced",
    complexity: "O(n)",
    tags: ["palindrome", "manacher"],
    summary:
      "Longest palindromic radius around every centre in linear time, covering odd and even centres. Gives the longest palindromic substring and counts all palindromic substrings.",
    usage: "auto d = manacher(s);   // d[i] = radius at transformed position i",
    code: String.raw`// returns radii over the transformed string "#a#b#a#": d[i]/2 is the palindrome length
vector<int> manacher(const string &s) {
    string t = "#";
    for (char c : s) { t += c; t += '#'; }
    int n = t.size(), l = 0, r = -1;
    vector<int> d(n, 0);
    for (int i = 0; i < n; i++) {
        int k = (i > r) ? 1 : min(d[l + r - i], r - i + 1);
        while (i - k >= 0 && i + k < n && t[i - k] == t[i + k]) k++;
        d[i] = k--;
        if (i + k > r) { l = i - k; r = i + k; }
    }
    return d;                                   // longest = max(d) - 1
}`,
  },
  {
    id: "trie-string",
    name: "Trie (prefix tree)",
    category: "string",
    level: "basic",
    complexity: "O(len) per operation",
    tags: ["trie", "prefix", "dictionary"],
    summary:
      "Stores a dictionary by shared prefixes, so insertion, lookup and 'how many words start with this prefix' all cost the length of the key.",
    usage: "Trie t; t.insert(\"abc\"); if (t.count(\"ab\")) ...",
    variants:
      "Add a counter per node for prefix counts, or a fail link per node to turn it into Aho-Corasick.",
    code: String.raw`struct Trie {
    struct Node { array<int, 26> nxt; int cntWord = 0, cntPrefix = 0;
                  Node() { nxt.fill(-1); } };
    vector<Node> nd{Node()};

    void insert(const string &s) {
        int cur = 0;
        for (char ch : s) {
            int c = ch - 'a';
            if (nd[cur].nxt[c] < 0) { nd.push_back(Node()); nd[cur].nxt[c] = nd.size() - 1; }
            cur = nd[cur].nxt[c];
            nd[cur].cntPrefix++;
        }
        nd[cur].cntWord++;
    }

    int countPrefix(const string &s) const {
        int cur = 0;
        for (char ch : s) {
            int c = ch - 'a';
            if (nd[cur].nxt[c] < 0) return 0;
            cur = nd[cur].nxt[c];
        }
        return nd[cur].cntPrefix;
    }

    bool contains(const string &s) const {
        int cur = 0;
        for (char ch : s) {
            int c = ch - 'a';
            if (nd[cur].nxt[c] < 0) return false;
            cur = nd[cur].nxt[c];
        }
        return nd[cur].cntWord > 0;
    }
};`,
  },
  {
    id: "aho-corasick",
    name: "Aho-Corasick Automaton",
    category: "string",
    level: "advanced",
    complexity: "O(total pattern length + text + matches)",
    tags: ["aho corasick", "multi-pattern", "automaton"],
    summary:
      "A trie plus failure links, so one pass over the text finds occurrences of every pattern. Also the transition table for DP over 'forbidden substrings'.",
    usage: "Aho a; a.add(p, id); a.build(); a.run(text);",
    code: String.raw`struct Aho {
    struct Node { array<int, 26> go; int fail = 0, cnt = 0;
                  Node() { go.fill(-1); } };
    vector<Node> nd{Node()};

    void add(const string &s) {
        int cur = 0;
        for (char ch : s) {
            int c = ch - 'a';
            if (nd[cur].go[c] < 0) { nd.push_back(Node()); nd[cur].go[c] = nd.size() - 1; }
            cur = nd[cur].go[c];
        }
        nd[cur].cnt++;
    }

    void build() {                              // BFS: turn the trie into an automaton
        queue<int> q;
        for (int c = 0; c < 26; c++) {
            if (nd[0].go[c] < 0) nd[0].go[c] = 0;
            else { nd[nd[0].go[c]].fail = 0; q.push(nd[0].go[c]); }
        }
        while (!q.empty()) {
            int v = q.front(); q.pop();
            nd[v].cnt += nd[nd[v].fail].cnt;     // aggregate along fail links
            for (int c = 0; c < 26; c++) {
                int u = nd[v].go[c];
                if (u < 0) nd[v].go[c] = nd[nd[v].fail].go[c];
                else { nd[u].fail = nd[nd[v].fail].go[c]; q.push(u); }
            }
        }
    }

    long long run(const string &text) const {
        int cur = 0;
        long long total = 0;
        for (char ch : text) {
            cur = nd[cur].go[ch - 'a'];
            total += nd[cur].cnt;
        }
        return total;
    }
};`,
  },
  {
    id: "suffix-array",
    name: "Suffix Array + LCP (Kasai)",
    category: "string",
    level: "advanced",
    complexity: "O(n log n)",
    tags: ["suffix array", "lcp", "sorting"],
    summary:
      "Sorts all suffixes by doubling comparisons with radix sort, then Kasai builds the LCP array. Answers distinct substrings, longest repeated substring and pattern search by binary search.",
    usage: "auto sa = suffix_array(s); auto lcp = kasai(s, sa);",
    variants:
      "Distinct substrings = n(n+1)/2 - sum(lcp). Longest common substring of two strings: concatenate with a separator and look at LCP across the boundary.",
    code: String.raw`vector<int> suffix_array(string s) {
    s += '\x01';
    int n = s.size(), alpha = 256;
    vector<int> p(n), c(n), cnt(max(alpha, n), 0), pn(n), cn(n);
    for (int i = 0; i < n; i++) cnt[(unsigned char)s[i]]++;
    for (int i = 1; i < alpha; i++) cnt[i] += cnt[i - 1];
    for (int i = 0; i < n; i++) p[--cnt[(unsigned char)s[i]]] = i;
    c[p[0]] = 0;
    int classes = 1;
    for (int i = 1; i < n; i++) {
        if (s[p[i]] != s[p[i - 1]]) classes++;
        c[p[i]] = classes - 1;
    }
    for (int h = 0; (1 << h) < n; h++) {
        for (int i = 0; i < n; i++) {
            pn[i] = p[i] - (1 << h);
            if (pn[i] < 0) pn[i] += n;
        }
        fill(cnt.begin(), cnt.begin() + classes, 0);
        for (int i = 0; i < n; i++) cnt[c[pn[i]]]++;
        for (int i = 1; i < classes; i++) cnt[i] += cnt[i - 1];
        for (int i = n - 1; i >= 0; i--) p[--cnt[c[pn[i]]]] = pn[i];
        cn[p[0]] = 0;
        classes = 1;
        for (int i = 1; i < n; i++) {
            pair<int,int> cur = {c[p[i]], c[(p[i] + (1 << h)) % n]};
            pair<int,int> prv = {c[p[i - 1]], c[(p[i - 1] + (1 << h)) % n]};
            if (cur != prv) classes++;
            cn[p[i]] = classes - 1;
        }
        c.swap(cn);
    }
    return vector<int>(p.begin() + 1, p.end());   // drop the sentinel
}

vector<int> kasai(const string &s, const vector<int> &sa) {
    int n = s.size();
    vector<int> rank_(n, 0), lcp(n > 0 ? n - 1 : 0, 0);
    for (int i = 0; i < n; i++) rank_[sa[i]] = i;
    int k = 0;
    for (int i = 0; i < n; i++) {
        if (rank_[i] == n - 1) { k = 0; continue; }
        int j = sa[rank_[i] + 1];
        while (i + k < n && j + k < n && s[i + k] == s[j + k]) k++;
        lcp[rank_[i]] = k;
        if (k) k--;
    }
    return lcp;
}`,
  },
  {
    id: "suffix-automaton",
    name: "Suffix Automaton",
    category: "string",
    level: "advanced",
    complexity: "O(n) states and transitions",
    tags: ["suffix automaton", "substrings", "dawg"],
    summary:
      "The minimal automaton accepting every suffix. Each state represents a set of substrings, so distinct-substring counts, occurrence counts and longest common substring all fall out of it.",
    usage: "SAM sam; for (char c : s) sam.extend(c);",
    variants:
      "Distinct substrings = sum over states of (len - len[link]). Occurrence count = subtree sum of clone-free states over the link tree.",
    code: String.raw`struct SAM {
    struct State { int len = 0, link = -1; map<char,int> next_; };
    vector<State> st{State()};
    int last = 0;

    void extend(char c) {
        int cur = st.size();
        st.push_back(State());
        st[cur].len = st[last].len + 1;
        int p = last;
        while (p != -1 && !st[p].next_.count(c)) { st[p].next_[c] = cur; p = st[p].link; }
        if (p == -1) { st[cur].link = 0; last = cur; return; }

        int q = st[p].next_[c];
        if (st[p].len + 1 == st[q].len) { st[cur].link = q; last = cur; return; }

        int clone = st.size();
        st.push_back(st[q]);
        st[clone].len = st[p].len + 1;
        while (p != -1 && st[p].next_[c] == q) { st[p].next_[c] = clone; p = st[p].link; }
        st[q].link = clone;
        st[cur].link = clone;
        last = cur;
    }

    long long distinctSubstrings() const {
        long long total = 0;
        for (size_t v = 1; v < st.size(); v++) total += st[v].len - st[st[v].link].len;
        return total;
    }
};`,
  },
  {
    id: "min-rotation",
    name: "Least Cyclic Rotation (Booth)",
    category: "string",
    level: "advanced",
    complexity: "O(n)",
    tags: ["rotation", "canonical form"],
    summary:
      "Finds the starting index of the lexicographically smallest rotation, which is the canonical form used to compare necklaces and cyclic sequences.",
    usage: "int k = min_rotation(s);   // s.substr(k) + s.substr(0,k) is minimal",
    code: String.raw`int min_rotation(string s) {
    int n = s.size();
    s += s;
    int i = 0, ans = 0;
    while (i < n) {
        ans = i;
        int j = i + 1, k = i;
        while (j < 2 * n && s[k] <= s[j]) {
            k = (s[k] < s[j]) ? i : k + 1;
            j++;
        }
        while (i <= k) i += j - k;
    }
    return ans;
}`,
  },
  {
    id: "lyndon-duval",
    name: "Lyndon Factorisation (Duval)",
    category: "string",
    level: "advanced",
    complexity: "O(n)",
    tags: ["lyndon", "factorisation", "suffix"],
    summary:
      "Splits a string into non-increasing Lyndon words in one pass with O(1) memory. Used for the smallest rotation, and to build the BWT and suffix structures.",
    usage: "auto parts = duval(s);",
    code: String.raw`vector<string> duval(const string &s) {
    int n = s.size(), i = 0;
    vector<string> res;
    while (i < n) {
        int j = i + 1, k = i;
        while (j < n && s[k] <= s[j]) {
            if (s[k] < s[j]) k = i;
            else k++;
            j++;
        }
        while (i <= k) { res.push_back(s.substr(i, j - k)); i += j - k; }
    }
    return res;
}`,
  },
  {
    id: "eertree",
    name: "Palindromic Tree (Eertree)",
    category: "string",
    level: "advanced",
    complexity: "O(n) amortised",
    tags: ["palindrome", "automaton"],
    summary:
      "Stores every distinct palindromic substring as one node, added incrementally. Counts distinct palindromes and how many palindromes end at each position.",
    usage: "Eertree t(s); long long distinct = t.st.size() - 2;",
    code: String.raw`struct Eertree {
    struct Node { int len, link; map<char,int> next_; long long cnt = 0; };
    vector<Node> st;
    string s;
    int suff = 1;

    explicit Eertree(const string &str) {
        st.push_back({-1, 0, {}, 0});          // root with len -1
        st.push_back({0, 0, {}, 0});           // root with len 0
        for (char c : str) addChar(c);
    }

    void addChar(char c) {
        s += c;
        int pos = s.size() - 1, cur = suff;
        while (true) {
            int curlen = st[cur].len;
            if (pos - curlen - 1 >= 0 && s[pos - curlen - 1] == c) break;
            cur = st[cur].link;
        }
        if (st[cur].next_.count(c)) { suff = st[cur].next_[c]; st[suff].cnt++; return; }

        int now = st.size();
        st.push_back({st[cur].len + 2, 1, {}, 1});
        st[cur].next_[c] = now;

        if (st[now].len == 1) { st[now].link = 1; suff = now; return; }

        int t = st[cur].link;
        while (true) {
            int tlen = st[t].len;
            if (pos - tlen - 1 >= 0 && s[pos - tlen - 1] == c) break;
            t = st[t].link;
        }
        st[now].link = st[t].next_[c];
        suff = now;
    }
};`,
  },
  {
    id: "rabin-karp",
    name: "Rabin-Karp Search",
    category: "string",
    level: "basic",
    complexity: "O(n + m) expected",
    tags: ["hashing", "matching", "rolling hash"],
    summary:
      "Slides a rolling hash over the text and compares against the pattern hash. Naturally extends to many patterns of equal length by putting their hashes in a set.",
    usage: "auto hits = rabin_karp(text, pat);",
    code: String.raw`vector<int> rabin_karp(const string &text, const string &pat) {
    const long long M = 1000000007, B = 131;
    int n = text.size(), m = pat.size();
    vector<int> res;
    if (m > n) return res;

    long long hp = 0, ht = 0, pw = 1;
    for (int i = 0; i < m; i++) {
        hp = (hp * B + pat[i]) % M;
        ht = (ht * B + text[i]) % M;
        if (i) pw = pw * B % M;
    }
    for (int i = 0; i + m <= n; i++) {
        if (hp == ht && text.compare(i, m, pat) == 0) res.push_back(i);
        if (i + m < n) {
            ht = (ht - text[i] * pw % M + M) % M;
            ht = (ht * B + text[i + m]) % M;
        }
    }
    return res;
}`,
  },
  {
    id: "borders-periods",
    name: "Borders & Periods",
    category: "string",
    level: "intermediate",
    complexity: "O(n)",
    tags: ["kmp", "period", "borders"],
    summary:
      "All borders of a string form a chain through the prefix function, and each border of length b gives a period n - b. The basis of 'is this string a repetition' questions.",
    usage: "auto b = all_borders(s); int p = smallest_period(s);",
    code: String.raw`// needs prefix_function from the KMP snippet
vector<int> all_borders(const string &s) {
    vector<int> pi = prefix_function(s), res;
    for (int b = pi.back(); b > 0; b = pi[b - 1]) res.push_back(b);
    return res;                                 // decreasing lengths
}

int smallest_period(const string &s) {
    vector<int> pi = prefix_function(s);
    int n = s.size(), p = n - pi.back();
    return (n % p == 0) ? p : n;                // n means "not a full repetition"
}`,
  },
  {
    id: "subsequence-automaton",
    name: "Subsequence Automaton",
    category: "string",
    level: "intermediate",
    complexity: "O(n * alphabet) build, O(m) per query",
    tags: ["subsequence", "next occurrence", "automaton"],
    summary:
      "next[i][c] is the first position of character c at or after i, so testing whether a string is a subsequence, or counting distinct subsequences, becomes a walk.",
    usage: "auto nxt = build_next(s); bool ok = is_subsequence(nxt, t);",
    code: String.raw`vector<array<int,26>> build_next(const string &s) {
    int n = s.size();
    vector<array<int,26>> nxt(n + 1);
    nxt[n].fill(n);
    for (int i = n - 1; i >= 0; i--) {
        nxt[i] = nxt[i + 1];
        nxt[i][s[i] - 'a'] = i;
    }
    return nxt;
}

bool is_subsequence(const vector<array<int,26>> &nxt, const string &t) {
    int pos = 0, n = nxt.size() - 1;
    for (char c : t) {
        if (pos > n) return false;
        int j = nxt[pos][c - 'a'];
        if (j >= n) return false;
        pos = j + 1;
    }
    return true;
}`,
  },
  {
    id: "longest-common-substring",
    name: "Longest Common Substring",
    category: "string",
    level: "advanced",
    complexity: "O((n + m) log) with hashing",
    tags: ["hashing", "binary search", "substring"],
    summary:
      "Binary searches the answer length and checks with hashed windows of both strings. Shorter to write than the suffix-automaton solution and fast enough for 1e5.",
    usage: "int len = longest_common_substring(a, b);",
    variants:
      "Suffix automaton of one string, fed with the other, gives an exact O(n + m) solution without hashing risk.",
    code: String.raw`// needs the Hash snippet
int longest_common_substring(const string &a, const string &b) {
    Hash ha(a), hb(b);
    int lo = 0, hi = min(a.size(), b.size()), best = 0;
    while (lo <= hi) {
        int len = (lo + hi) / 2;
        if (len == 0) { lo = 1; continue; }
        set<pair<long long,long long>> seen;
        for (int i = 0; i + len <= (int)a.size(); i++) seen.insert(ha.get(i, i + len - 1));
        bool found = false;
        for (int i = 0; i + len <= (int)b.size() && !found; i++)
            found = seen.count(hb.get(i, i + len - 1)) > 0;
        if (found) { best = len; lo = len + 1; }
        else hi = len - 1;
    }
    return best;
}`,
  },
];

export default algos;
