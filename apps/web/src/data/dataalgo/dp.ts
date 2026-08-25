import type { Algo } from "./types";

const algos: Algo[] = [
  {
    id: "kadane",
    name: "Maximum Subarray (Kadane)",
    category: "dp",
    level: "basic",
    complexity: "O(n)",
    tags: ["subarray", "greedy dp"],
    summary:
      "Best contiguous sum in one pass: either extend the previous subarray or start fresh at the current element.",
    usage: "long long best = kadane(a);",
    variants:
      "Track start/end indices for the actual segment; for a circular array, answer = max(normal, total - minimum subarray).",
    code: String.raw`long long kadane(const vector<int> &a) {
    long long best = LLONG_MIN, cur = 0;
    for (int x : a) {
        cur = max((long long)x, cur + x);
        best = max(best, cur);
    }
    return best;
}`,
  },
  {
    id: "knapsack-01",
    name: "0/1 Knapsack",
    category: "dp",
    level: "basic",
    complexity: "O(n W)",
    tags: ["knapsack", "subset"],
    summary:
      "Each item taken at most once. The 1D rolling array works only when the capacity loop runs downwards, which is what forbids reuse.",
    usage: "long long best = knapsack01(w, v, W);",
    variants:
      "Reconstruct the chosen items by keeping the 2D table, or by re-running the DP over a prefix.",
    code: String.raw`long long knapsack01(const vector<int> &w, const vector<long long> &val, int W) {
    vector<long long> dp(W + 1, 0);
    for (size_t i = 0; i < w.size(); i++)
        for (int c = W; c >= w[i]; c--)              // downwards: item used once
            dp[c] = max(dp[c], dp[c - w[i]] + val[i]);
    return dp[W];
}`,
  },
  {
    id: "knapsack-unbounded",
    name: "Unbounded Knapsack & Coin Change",
    category: "dp",
    level: "basic",
    complexity: "O(n W)",
    tags: ["knapsack", "coins"],
    summary:
      "Items reusable without limit, so the capacity loop runs upwards. The same shape counts coin combinations or finds the fewest coins.",
    usage: "long long best = knapsack_unbounded(w, val, W);",
    variants:
      "Count combinations: iterate coins outside, capacities inside. Count ordered sequences: swap the loops.",
    code: String.raw`long long knapsack_unbounded(const vector<int> &w, const vector<long long> &val, int W) {
    vector<long long> dp(W + 1, 0);
    for (size_t i = 0; i < w.size(); i++)
        for (int c = w[i]; c <= W; c++)              // upwards: reuse allowed
            dp[c] = max(dp[c], dp[c - w[i]] + val[i]);
    return dp[W];
}

long long count_ways(const vector<int> &coins, int target) {   // combinations
    vector<long long> dp(target + 1, 0);
    dp[0] = 1;
    for (int c : coins)
        for (int s = c; s <= target; s++) dp[s] += dp[s - c];
    return dp[target];
}

int min_coins(const vector<int> &coins, int target) {
    const int INF = 1e9;
    vector<int> dp(target + 1, INF);
    dp[0] = 0;
    for (int s = 1; s <= target; s++)
        for (int c : coins)
            if (c <= s) dp[s] = min(dp[s], dp[s - c] + 1);
    return dp[target] >= INF ? -1 : dp[target];
}`,
  },
  {
    id: "knapsack-bounded",
    name: "Bounded Knapsack (binary splitting)",
    category: "dp",
    level: "intermediate",
    complexity: "O(W sum log k)",
    tags: ["knapsack", "binary splitting"],
    summary:
      "At most k copies per item. Splitting k into powers of two (1, 2, 4, ..., remainder) reduces it to 0/1 knapsack with log k pseudo-items.",
    usage: "long long best = knapsack_bounded(items, W);",
    variants:
      "A monotonic-deque DP does it in O(nW) exactly, but binary splitting is far shorter and fast enough.",
    code: String.raw`struct Item { int w, cnt; long long val; };

long long knapsack_bounded(const vector<Item> &items, int W) {
    vector<long long> dp(W + 1, 0);
    for (const auto &it : items) {
        int k = it.cnt;
        for (int step = 1; k > 0; step <<= 1) {
            int take = min(step, k);
            k -= take;
            int ww = it.w * take;
            long long vv = it.val * take;
            for (int c = W; c >= ww; c--) dp[c] = max(dp[c], dp[c - ww] + vv);
        }
    }
    return dp[W];
}`,
  },
  {
    id: "subset-sum-bitset",
    name: "Subset Sum with Bitset",
    category: "dp",
    level: "intermediate",
    complexity: "O(n S / 64)",
    tags: ["subset sum", "bitset", "optimisation"],
    summary:
      "Reachability-only subset sum where the DP row is a bitset and one shift-or handles every capacity at once. A 64x constant-factor win over the boolean loop.",
    usage: "auto reach = subset_sum(a, 100000); if (reach[t]) ...",
    variants:
      "For multiplicities, combine with binary splitting; for counting rather than reachability you must go back to integers.",
    code: String.raw`bitset<100001> subset_sum(const vector<int> &a, int S) {
    bitset<100001> dp;
    dp[0] = 1;
    for (int x : a) dp |= dp << x;
    return dp;
}`,
  },
  {
    id: "lis",
    name: "Longest Increasing Subsequence",
    category: "dp",
    level: "intermediate",
    complexity: "O(n log n)",
    tags: ["lis", "binary search", "patience"],
    summary:
      "Keeps the smallest possible tail for each length, so a binary search per element gives the LIS length and, with parent links, the subsequence itself.",
    usage: "int len = lis(a);   // strictly increasing",
    variants:
      "Non-decreasing: use upper_bound instead of lower_bound. Longest decreasing: reverse or negate the input.",
    code: String.raw`int lis(const vector<int> &a) {
    vector<int> tail;                          // tail[k] = min end of an LIS of length k+1
    for (int x : a) {
        auto it = lower_bound(tail.begin(), tail.end(), x);   // upper_bound => non-decreasing
        if (it == tail.end()) tail.push_back(x);
        else *it = x;
    }
    return tail.size();
}

vector<int> lis_sequence(const vector<int> &a) {
    int n = a.size();
    vector<int> tail, tailIdx, par(n, -1), res;
    for (int i = 0; i < n; i++) {
        auto it = lower_bound(tail.begin(), tail.end(), a[i]);
        int k = it - tail.begin();
        if (k > 0) par[i] = tailIdx[k - 1];
        if (it == tail.end()) { tail.push_back(a[i]); tailIdx.push_back(i); }
        else { *it = a[i]; tailIdx[k] = i; }
    }
    for (int i = tailIdx.empty() ? -1 : tailIdx.back(); i != -1; i = par[i]) res.push_back(a[i]);
    reverse(res.begin(), res.end());
    return res;
}`,
  },
  {
    id: "lcs",
    name: "Longest Common Subsequence",
    category: "dp",
    level: "basic",
    complexity: "O(n m)",
    tags: ["lcs", "strings", "grid dp"],
    summary:
      "Classic two-sequence DP: matching characters extend the diagonal, otherwise take the better of dropping one character. Reconstruction walks the table backwards.",
    usage: "int len = lcs(a, b);   auto s = lcs_string(a, b);",
    variants:
      "When one string has distinct characters, LCS becomes an LIS over positions and runs in O(n log n).",
    code: String.raw`int lcs(const string &a, const string &b) {
    int n = a.size(), m = b.size();
    vector<vector<int>> dp(n + 1, vector<int>(m + 1, 0));
    for (int i = 1; i <= n; i++)
        for (int j = 1; j <= m; j++)
            dp[i][j] = (a[i - 1] == b[j - 1]) ? dp[i - 1][j - 1] + 1
                                              : max(dp[i - 1][j], dp[i][j - 1]);
    return dp[n][m];
}

string lcs_string(const string &a, const string &b) {
    int n = a.size(), m = b.size();
    vector<vector<int>> dp(n + 1, vector<int>(m + 1, 0));
    for (int i = 1; i <= n; i++)
        for (int j = 1; j <= m; j++)
            dp[i][j] = (a[i - 1] == b[j - 1]) ? dp[i - 1][j - 1] + 1
                                              : max(dp[i - 1][j], dp[i][j - 1]);
    string res;
    int i = n, j = m;
    while (i && j) {
        if (a[i - 1] == b[j - 1]) { res += a[i - 1]; i--; j--; }
        else if (dp[i - 1][j] >= dp[i][j - 1]) i--;
        else j--;
    }
    reverse(res.begin(), res.end());
    return res;
}`,
  },
  {
    id: "edit-distance",
    name: "Edit Distance (Levenshtein)",
    category: "dp",
    level: "basic",
    complexity: "O(n m) time, O(min(n,m)) space",
    tags: ["strings", "dp"],
    summary:
      "Minimum insert/delete/replace operations to turn one string into another, with a rolling two-row table.",
    usage: "int d = edit_distance(a, b);",
    variants:
      "Add a transposition case for Damerau-Levenshtein; weight the operations differently by changing the three costs.",
    code: String.raw`int edit_distance(const string &a, const string &b) {
    int n = a.size(), m = b.size();
    vector<int> prev(m + 1), cur(m + 1);
    for (int j = 0; j <= m; j++) prev[j] = j;
    for (int i = 1; i <= n; i++) {
        cur[0] = i;
        for (int j = 1; j <= m; j++)
            cur[j] = (a[i - 1] == b[j - 1])
                   ? prev[j - 1]
                   : 1 + min({prev[j - 1], prev[j], cur[j - 1]});
        swap(prev, cur);
    }
    return prev[m];
}`,
  },
  {
    id: "digit-dp",
    name: "Digit DP",
    category: "dp",
    level: "advanced",
    complexity: "O(digits * states * 10)",
    tags: ["digit dp", "counting", "memoisation"],
    summary:
      "Counts numbers in a range with a digit property by building them digit by digit, tracking a 'still equal to the bound' flag and whether leading zeros are still active.",
    usage: "long long ans = count_upto(\"12345\") - count_upto(\"999\");",
    variants:
      "Add state for 'sum of digits mod k', 'last digit', or a bitmask of used digits — the tight/lead flags stay the same.",
    code: String.raw`string bound_;
vector<vector<vector<long long>>> memo;      // [pos][sum][tight]

long long go(int pos, int sum, bool tight, bool lead) {
    if (pos == (int)bound_.size()) return sum % 3 == 0 && !lead;   // example property
    long long &m = memo[pos][sum][tight];
    if (!tight && !lead && m != -1) return m;

    int hi = tight ? bound_[pos] - '0' : 9;
    long long res = 0;
    for (int d = 0; d <= hi; d++)
        res += go(pos + 1, (sum + d) % 3, tight && d == hi, lead && d == 0);

    if (!tight && !lead) m = res;
    return res;
}

long long count_upto(const string &s) {
    bound_ = s;
    memo.assign(s.size(), vector<vector<long long>>(3, vector<long long>(2, -1)));
    return go(0, 0, true, true);
}`,
  },
  {
    id: "bitmask-tsp",
    name: "Bitmask DP (TSP / Hamiltonian)",
    category: "dp",
    level: "advanced",
    complexity: "O(2^n * n^2)",
    tags: ["bitmask", "tsp", "hamiltonian"],
    summary:
      "State is (visited set, current vertex), so shortest Hamiltonian path or cycle is feasible up to about n = 20.",
    usage: "long long best = tsp(dist);",
    variants:
      "Counting Hamiltonian paths uses the same recurrence with sums; 'assign n tasks to n workers' is the same DP with a popcount index.",
    code: String.raw`long long tsp(const vector<vector<long long>> &d) {
    int n = d.size();
    const long long INF = (long long)4e18;
    vector<vector<long long>> dp(1 << n, vector<long long>(n, INF));
    dp[1][0] = 0;
    for (int mask = 1; mask < (1 << n); mask++)
        for (int v = 0; v < n; v++) {
            if (dp[mask][v] == INF || !((mask >> v) & 1)) continue;
            for (int u = 0; u < n; u++) {
                if ((mask >> u) & 1) continue;
                int nm = mask | (1 << u);
                dp[nm][u] = min(dp[nm][u], dp[mask][v] + d[v][u]);
            }
        }
    long long best = INF;
    for (int v = 0; v < n; v++)
        if (dp[(1 << n) - 1][v] < INF) best = min(best, dp[(1 << n) - 1][v] + d[v][0]);
    return best;
}`,
  },
  {
    id: "sos-dp",
    name: "SOS DP (subset sum over subsets)",
    category: "dp",
    level: "advanced",
    complexity: "O(2^n * n)",
    tags: ["bitmask", "zeta transform", "subsets"],
    summary:
      "Sums f over all subsets (or supersets) of every mask in n passes instead of 3^n. The bitwise analogue of a prefix sum, and the base of AND/OR convolution.",
    usage: "auto sub = sos_subset(f, n);",
    variants:
      "Reverse the inner condition for supersets. Mobius inversion (subtract instead of add) recovers f from its subset sums.",
    code: String.raw`vector<long long> sos_subset(vector<long long> f, int n) {
    for (int i = 0; i < n; i++)
        for (int mask = 0; mask < (1 << n); mask++)
            if (mask & (1 << i)) f[mask] += f[mask ^ (1 << i)];
    return f;                                  // f[mask] = sum over submasks
}

vector<long long> sos_superset(vector<long long> f, int n) {
    for (int i = 0; i < n; i++)
        for (int mask = 0; mask < (1 << n); mask++)
            if (!(mask & (1 << i))) f[mask] += f[mask | (1 << i)];
    return f;
}

// enumerate submasks of a mask in O(2^popcount)
// for (int s = mask; ; s = (s - 1) & mask) { ...; if (!s) break; }`,
  },
  {
    id: "interval-dp",
    name: "Interval DP",
    category: "dp",
    level: "intermediate",
    complexity: "O(n^3)",
    tags: ["interval", "matrix chain", "merging"],
    summary:
      "Solves 'merge a range optimally' by trying every split point, filling the table by increasing length. Matrix chain, stone merging and optimal triangulation all fit.",
    usage: "long long best = merge_stones(a);",
    variants:
      "When the cost function is monotone and satisfies the quadrangle inequality, Knuth optimisation drops it to O(n^2).",
    code: String.raw`long long merge_stones(const vector<long long> &a) {
    int n = a.size();
    vector<long long> pre(n + 1, 0);
    for (int i = 0; i < n; i++) pre[i + 1] = pre[i] + a[i];
    vector<vector<long long>> dp(n, vector<long long>(n, 0));

    for (int len = 2; len <= n; len++)
        for (int l = 0; l + len - 1 < n; l++) {
            int r = l + len - 1;
            dp[l][r] = LLONG_MAX;
            for (int m = l; m < r; m++)
                dp[l][r] = min(dp[l][r], dp[l][m] + dp[m + 1][r]);
            dp[l][r] += pre[r + 1] - pre[l];
        }
    return dp[0][n - 1];
}`,
  },
  {
    id: "tree-knapsack",
    name: "Tree Knapsack (dp on subtrees)",
    category: "dp",
    level: "advanced",
    complexity: "O(n * K)",
    tags: ["tree dp", "knapsack", "merging"],
    summary:
      "Chooses k vertices inside a rooted tree by merging child DP arrays like knapsacks. Bounding the loops by subtree size makes it quadratic overall, not cubic.",
    usage: "dfs(g, 0, -1); long long best = dp[0][k];",
    code: String.raw`int K;
vector<vector<long long>> dp;                 // dp[v][j] = best using j picks in subtree v
vector<int> sz_, value_;

void dfs(const vector<vector<int>> &g, int v, int p) {
    sz_[v] = 1;
    dp[v].assign(2, 0);
    dp[v][1] = value_[v];
    for (int u : g[v]) {
        if (u == p) continue;
        dfs(g, u, v);
        vector<long long> merged(min(K, sz_[v] + sz_[u]) + 1, LLONG_MIN);
        for (int j = 0; j <= min(sz_[v], K); j++) {
            if (dp[v][j] == LLONG_MIN) continue;
            for (int t = 0; t <= min(sz_[u], K - j); t++) {
                if (dp[u][t] == LLONG_MIN) continue;
                merged[j + t] = max(merged[j + t], dp[v][j] + dp[u][t]);
            }
        }
        sz_[v] += sz_[u];
        dp[v] = merged;
    }
}`,
  },
  {
    id: "dnc-optimization",
    name: "Divide & Conquer DP Optimisation",
    category: "dp",
    level: "advanced",
    complexity: "O(k n log n)",
    tags: ["optimisation", "monotone", "layers"],
    summary:
      "When the optimal split point is monotone in the row index, recursing on (row range, split range) turns an O(k n^2) layered DP into O(k n log n).",
    usage: "solve(0, n - 1, 0, n - 1);   // fills cur[] from prev[]",
    variants:
      "Requires opt(i) <= opt(i+1). If instead the cost satisfies the quadrangle inequality, Knuth's O(n^2) form applies.",
    code: String.raw`vector<long long> prev_, cur_;

long long cost(int l, int r);                  // problem-specific, O(1) after prefix sums

void solve(int lo, int hi, int optLo, int optHi) {
    if (lo > hi) return;
    int mid = (lo + hi) / 2;
    pair<long long,int> best = {LLONG_MAX, -1};
    for (int k = optLo; k <= min(mid, optHi); k++)
        best = min(best, make_pair(prev_[k] + cost(k, mid), k));
    cur_[mid] = best.first;
    solve(lo, mid - 1, optLo, best.second);
    solve(mid + 1, hi, best.second, optHi);
}`,
  },
  {
    id: "knuth-optimization",
    name: "Knuth Optimisation",
    category: "dp",
    level: "advanced",
    complexity: "O(n^2)",
    tags: ["optimisation", "interval dp", "quadrangle"],
    summary:
      "For interval DP whose cost obeys the quadrangle inequality, the optimal split lies between the splits of the two shorter intervals, so the inner loop shrinks.",
    usage: "long long best = knuth(a);",
    code: String.raw`long long knuth(const vector<long long> &a) {
    int n = a.size();
    vector<long long> pre(n + 1, 0);
    for (int i = 0; i < n; i++) pre[i + 1] = pre[i] + a[i];
    vector<vector<long long>> dp(n, vector<long long>(n, 0));
    vector<vector<int>> opt(n, vector<int>(n, 0));

    for (int i = 0; i < n; i++) opt[i][i] = i;
    for (int len = 2; len <= n; len++)
        for (int l = 0; l + len - 1 < n; l++) {
            int r = l + len - 1;
            dp[l][r] = LLONG_MAX;
            for (int m = opt[l][r - 1]; m <= min(r - 1, opt[l + 1][r]); m++) {
                long long val = dp[l][m] + dp[m + 1][r] + pre[r + 1] - pre[l];
                if (val < dp[l][r]) { dp[l][r] = val; opt[l][r] = m; }
            }
        }
    return dp[0][n - 1];
}`,
  },
  {
    id: "convex-hull-trick",
    name: "Convex Hull Trick (monotone)",
    category: "dp",
    level: "advanced",
    complexity: "O(n) amortised",
    tags: ["cht", "lines", "optimisation"],
    summary:
      "Maintains a lower hull of lines so 'minimum of a*x + b over many lines' is a pointer walk. Collapses DP transitions of the form dp[i] = min(dp[j] + f(j)*x(i)).",
    usage: "CHT h; h.add(m, c); long long best = h.query(x);",
    variants:
      "Requires slopes added in monotone order and queries monotone too. Otherwise use Li Chao tree or a std::multiset hull.",
    code: String.raw`struct CHT {                                  // slopes added decreasing, x queried increasing
    vector<long long> m, c;
    int ptr = 0;

    bool bad(int a, int b, int d) {
        return (__int128)(c[d] - c[a]) * (m[a] - m[b]) <= (__int128)(c[b] - c[a]) * (m[a] - m[d]);
    }

    void add(long long slope, long long intercept) {
        m.push_back(slope); c.push_back(intercept);
        while (m.size() >= 3 && bad(m.size() - 3, m.size() - 2, m.size() - 1)) {
            m.erase(m.end() - 2);
            c.erase(c.end() - 2);
        }
        ptr = min(ptr, (int)m.size() - 1);
    }

    long long query(long long x) {
        if (ptr >= (int)m.size()) ptr = m.size() - 1;
        while (ptr + 1 < (int)m.size() && m[ptr + 1] * x + c[ptr + 1] <= m[ptr] * x + c[ptr]) ptr++;
        return m[ptr] * x + c[ptr];
    }
};`,
  },
  {
    id: "li-chao",
    name: "Li Chao Tree",
    category: "dp",
    level: "advanced",
    complexity: "O(log C) per insert and query",
    tags: ["cht", "segment tree", "lines"],
    summary:
      "A segment tree over x that stores one candidate line per node, so lines can be inserted in any order and queried at any point. The general-purpose replacement for CHT.",
    usage: "LiChao t(-1e9, 1e9); t.add(m, c); long long best = t.query(x);",
    variants:
      "Insert segments instead of full lines by descending to O(log C) nodes first — that gives the 'Li Chao on segments' variant.",
    code: String.raw`struct LiChao {
    struct Line { long long m = 0, c = (long long)4e18; };
    struct Node { Line ln; int l = -1, r = -1; };
    vector<Node> nd;
    long long lo, hi;

    LiChao(long long lo, long long hi) : lo(lo), hi(hi) { nd.push_back({}); }

    static long long f(const Line &ln, long long x) { return ln.m * x + ln.c; }

    void add(long long m, long long c, int node = 0, long long l = LLONG_MIN, long long r = LLONG_MIN) {
        if (l == LLONG_MIN) { l = lo; r = hi; }
        Line ln{m, c};
        long long mid = l + (r - l) / 2;
        bool left = f(ln, l) < f(nd[node].ln, l);
        bool atMid = f(ln, mid) < f(nd[node].ln, mid);
        if (atMid) swap(nd[node].ln, ln);
        if (l == r || ln.c == (long long)4e18) return;
        if (left != atMid) {
            if (nd[node].l < 0) { nd.push_back({}); nd[node].l = nd.size() - 1; }
            add(ln.m, ln.c, nd[node].l, l, mid);
        } else {
            if (nd[node].r < 0) { nd.push_back({}); nd[node].r = nd.size() - 1; }
            add(ln.m, ln.c, nd[node].r, mid + 1, r);
        }
    }

    long long query(long long x, int node = 0, long long l = LLONG_MIN, long long r = LLONG_MIN) {
        if (node < 0) return (long long)4e18;
        if (l == LLONG_MIN) { l = lo; r = hi; }
        long long res = f(nd[node].ln, x), mid = l + (r - l) / 2;
        if (l == r) return res;
        if (x <= mid) return min(res, query(x, nd[node].l, l, mid));
        return min(res, query(x, nd[node].r, mid + 1, r));
    }
};`,
  },
  {
    id: "expected-value-dp",
    name: "Expectation & Probability DP",
    category: "dp",
    level: "intermediate",
    complexity: "O(states * transitions)",
    tags: ["probability", "expectation", "linearity"],
    summary:
      "Expected values satisfy the same recurrences as counts, weighted by transition probabilities. Process states in an order where every dependency is already known.",
    usage: "double e = expected_rolls(n);",
    variants:
      "Self-loops (retry with probability p) resolve algebraically: E = (1 + sum) / (1 - p). Cyclic systems need Gaussian elimination.",
    code: String.raw`// expected number of dice throws to move from 0 to >= n on a 6-sided die
double expected_rolls(int n) {
    vector<double> dp(n + 1, 0.0);
    for (int i = n - 1; i >= 0; i--) {
        double s = 0;
        for (int d = 1; d <= 6; d++) s += dp[min(n, i + d)];
        dp[i] = 1.0 + s / 6.0;
    }
    return dp[0];
}

// probability of reaching each state, forward pass
vector<double> reach_prob(const vector<vector<pair<int,double>>> &g, int s) {
    vector<double> p(g.size(), 0.0);
    p[s] = 1.0;
    for (size_t v = 0; v < g.size(); v++)          // requires a DAG / topological order
        for (auto [u, pr] : g[v]) p[u] += p[v] * pr;
    return p;
}`,
  },
  {
    id: "broken-profile",
    name: "Broken Profile DP",
    category: "dp",
    level: "advanced",
    complexity: "O(n m 2^m)",
    tags: ["bitmask", "grid", "tiling"],
    summary:
      "Fills a grid cell by cell carrying a bitmask of the boundary, so domino and polyomino tilings are countable for widths up to about 15.",
    usage: "long long ways = tilings(n, m);",
    code: String.raw`// count domino tilings of an n x m grid (m <= 15)
long long tilings(int n, int m) {
    vector<long long> dp(1 << m, 0), nxt;
    dp[0] = 1;
    for (int i = 0; i < n; i++)
        for (int j = 0; j < m; j++) {
            nxt.assign(1 << m, 0);
            for (int mask = 0; mask < (1 << m); mask++) {
                if (!dp[mask]) continue;
                if (mask & (1 << j)) {
                    nxt[mask ^ (1 << j)] += dp[mask];              // cell already covered
                } else {
                    nxt[mask | (1 << j)] += dp[mask];              // place vertical domino
                    if (j + 1 < m && !(mask & (1 << (j + 1))))
                        nxt[mask | (1 << (j + 1))] += dp[mask];    // place horizontal
                }
            }
            dp = nxt;
        }
    return dp[0];
}`,
  },
  {
    id: "grid-paths",
    name: "Grid Path Counting",
    category: "dp",
    level: "basic",
    complexity: "O(n m)",
    tags: ["grid", "counting", "obstacles"],
    summary:
      "Counts monotone paths through a grid with blocked cells. Without obstacles it is a single binomial; with a few obstacles, inclusion-exclusion over them is faster than the grid DP.",
    usage: "long long ways = grid_paths(grid);   // '#' blocks",
    code: String.raw`const long long MOD = 1000000007;

long long grid_paths(const vector<string> &g) {
    int n = g.size(), m = g[0].size();
    vector<vector<long long>> dp(n, vector<long long>(m, 0));
    dp[0][0] = (g[0][0] == '#') ? 0 : 1;
    for (int i = 0; i < n; i++)
        for (int j = 0; j < m; j++) {
            if (g[i][j] == '#') { dp[i][j] = 0; continue; }
            if (i) dp[i][j] = (dp[i][j] + dp[i - 1][j]) % MOD;
            if (j) dp[i][j] = (dp[i][j] + dp[i][j - 1]) % MOD;
        }
    return dp[n - 1][m - 1];
}`,
  },
];

export default algos;
