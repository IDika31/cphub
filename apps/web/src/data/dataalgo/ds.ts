import type { Algo } from "./types";

const algos: Algo[] = [
  {
    id: "prefix-sum",
    name: "Prefix Sums & Difference Array",
    category: "ds",
    level: "basic",
    complexity: "O(n) build, O(1) query",
    tags: ["prefix", "range update"],
    summary:
      "Prefix sums answer range sums in constant time; the difference array is the dual, applying many range additions offline in one pass.",
    usage: "auto pre = prefix(a); long long s = range_sum(pre, l, r);",
    variants:
      "2D versions below; XOR prefixes work the same way since XOR is its own inverse.",
    code: String.raw`vector<long long> prefix(const vector<int> &a) {
    vector<long long> p(a.size() + 1, 0);
    for (size_t i = 0; i < a.size(); i++) p[i + 1] = p[i] + a[i];
    return p;
}

long long range_sum(const vector<long long> &p, int l, int r) {   // inclusive
    return p[r + 1] - p[l];
}

// offline range additions: add v to [l, r] for many queries, then finalise
struct Diff {
    vector<long long> d;
    explicit Diff(int n) : d(n + 1, 0) {}
    void add(int l, int r, long long v) { d[l] += v; d[r + 1] -= v; }
    vector<long long> build() {
        vector<long long> a(d.size() - 1);
        long long cur = 0;
        for (size_t i = 0; i + 1 < d.size(); i++) { cur += d[i]; a[i] = cur; }
        return a;
    }
};`,
  },
  {
    id: "prefix-sum-2d",
    name: "2D Prefix Sums & 2D Difference",
    category: "ds",
    level: "intermediate",
    complexity: "O(nm) build, O(1) query",
    tags: ["prefix", "grid"],
    summary:
      "Sum of any axis-aligned rectangle in constant time via inclusion-exclusion, plus the 2D difference array for bulk rectangle updates.",
    usage: "long long s = rect_sum(pre, r1, c1, r2, c2);",
    code: String.raw`vector<vector<long long>> prefix2d(const vector<vector<int>> &g) {
    int n = g.size(), m = n ? g[0].size() : 0;
    vector<vector<long long>> p(n + 1, vector<long long>(m + 1, 0));
    for (int i = 0; i < n; i++)
        for (int j = 0; j < m; j++)
            p[i + 1][j + 1] = p[i][j + 1] + p[i + 1][j] - p[i][j] + g[i][j];
    return p;
}

long long rect_sum(const vector<vector<long long>> &p, int r1, int c1, int r2, int c2) {
    return p[r2 + 1][c2 + 1] - p[r1][c2 + 1] - p[r2 + 1][c1] + p[r1][c1];
}

// add v to every cell of the rectangle, then prefix-sum twice to finalise
void diff2d_add(vector<vector<long long>> &d, int r1, int c1, int r2, int c2, long long v) {
    d[r1][c1] += v;
    d[r1][c2 + 1] -= v;
    d[r2 + 1][c1] -= v;
    d[r2 + 1][c2 + 1] += v;
}`,
  },
  {
    id: "dsu",
    name: "DSU / Union-Find",
    category: "ds",
    level: "basic",
    complexity: "O(alpha(n)) amortised",
    tags: ["dsu", "connectivity"],
    summary:
      "Maintains disjoint sets under union with path compression and union by size. The default tool for connectivity, Kruskal and offline merging.",
    usage: "DSU d(n); d.unite(u, v); if (d.find(u) == d.find(v)) ...",
    variants:
      "Track set size, component count, or a per-set aggregate in the root; see the rollback and parity variants.",
    code: String.raw`struct DSU {
    vector<int> p, sz;
    int comps;

    explicit DSU(int n) : p(n), sz(n, 1), comps(n) {
        iota(p.begin(), p.end(), 0);
    }

    int find(int x) {
        while (p[x] != x) x = p[x] = p[p[x]];   // path halving
        return x;
    }

    bool unite(int a, int b) {
        a = find(a); b = find(b);
        if (a == b) return false;
        if (sz[a] < sz[b]) swap(a, b);
        p[b] = a;
        sz[a] += sz[b];
        comps--;
        return true;
    }

    int size(int x) { return sz[find(x)]; }
};`,
  },
  {
    id: "dsu-rollback",
    name: "DSU with Rollback",
    category: "ds",
    level: "advanced",
    complexity: "O(log n) per op",
    tags: ["dsu", "offline", "divide and conquer"],
    summary:
      "Union by size without path compression, so every merge can be undone. Required for offline dynamic connectivity and DSU on segment tree of time.",
    usage: "int mark = d.snapshot(); d.unite(u, v); d.rollback(mark);",
    code: String.raw`struct DSURollback {
    vector<int> p, sz;
    vector<pair<int,int>> hist;          // (child root, parent root)
    int comps;

    explicit DSURollback(int n) : p(n), sz(n, 1), comps(n) {
        iota(p.begin(), p.end(), 0);
    }

    int find(int x) const {              // no compression: keeps history valid
        while (p[x] != x) x = p[x];
        return x;
    }

    bool unite(int a, int b) {
        a = find(a); b = find(b);
        if (a == b) return false;
        if (sz[a] < sz[b]) swap(a, b);
        hist.push_back({b, a});
        p[b] = a;
        sz[a] += sz[b];
        comps--;
        return true;
    }

    int snapshot() const { return hist.size(); }

    void rollback(int mark) {
        while ((int)hist.size() > mark) {
            auto [b, a] = hist.back(); hist.pop_back();
            p[b] = b;
            sz[a] -= sz[b];
            comps++;
        }
    }
};`,
  },
  {
    id: "dsu-parity",
    name: "DSU with Parity (bipartiteness)",
    category: "ds",
    level: "intermediate",
    complexity: "O(alpha(n))",
    tags: ["dsu", "bipartite", "parity"],
    summary:
      "Stores the parity of the path to the root, so it can answer 'are u and v on the same side' and detect odd cycles as edges arrive.",
    usage: "if (!d.unite(u, v)) { /* conflicting constraint */ }",
    variants:
      "Generalises to weights in any abelian group (add mod k, XOR) — same code with a different accumulator.",
    code: String.raw`struct DSUParity {
    vector<int> p, rnk, rel;             // rel[x] = parity of x vs p[x]

    explicit DSUParity(int n) : p(n), rnk(n, 0), rel(n, 0) {
        iota(p.begin(), p.end(), 0);
    }

    pair<int,int> find(int x) {          // (root, parity to root)
        if (p[x] == x) return {x, 0};
        auto [r, pr] = find(p[x]);
        p[x] = r;
        rel[x] ^= pr;
        return {r, rel[x]};
    }

    // returns false if u and v are forced to differ but already agree
    bool unite(int u, int v) {           // constraint: u != v
        auto [ru, pu] = find(u);
        auto [rv, pv] = find(v);
        if (ru == rv) return (pu ^ pv) == 1;
        if (rnk[ru] < rnk[rv]) { swap(ru, rv); swap(pu, pv); }
        p[rv] = ru;
        rel[rv] = pu ^ pv ^ 1;
        if (rnk[ru] == rnk[rv]) rnk[ru]++;
        return true;
    }
};`,
  },
  {
    id: "fenwick",
    name: "Fenwick Tree (BIT)",
    category: "ds",
    level: "basic",
    complexity: "O(log n) per op",
    tags: ["bit", "prefix", "point update"],
    summary:
      "Point update, prefix sum query in a single array with tiny constants. First choice whenever a segment tree would only ever do sums.",
    usage: "Fenwick f(n); f.add(i, v); long long s = f.range(l, r);",
    variants:
      "Store counts to get 'inversions' or 'number of smaller elements seen'; see the range-update and k-th variants.",
    code: String.raw`struct Fenwick {
    int n;
    vector<long long> b;

    explicit Fenwick(int n) : n(n), b(n + 1, 0) {}

    void add(int i, long long v) {          // 0-indexed
        for (++i; i <= n; i += i & -i) b[i] += v;
    }

    long long sum(int i) const {            // prefix [0, i]
        long long r = 0;
        for (++i; i > 0; i -= i & -i) r += b[i];
        return r;
    }

    long long range(int l, int r) const {   // inclusive
        return l > r ? 0 : sum(r) - (l ? sum(l - 1) : 0);
    }
};`,
  },
  {
    id: "fenwick-range",
    name: "Fenwick with Range Update",
    category: "ds",
    level: "intermediate",
    complexity: "O(log n) per op",
    tags: ["bit", "range update", "range query"],
    summary:
      "Two BITs give range add plus range sum, matching a lazy segment tree for this one operation pair at a fraction of the code.",
    usage: "FenwickRange f(n); f.add(l, r, v); long long s = f.sum(l, r);",
    code: String.raw`struct FenwickRange {
    int n;
    vector<long long> b1, b2;

    explicit FenwickRange(int n) : n(n), b1(n + 2, 0), b2(n + 2, 0) {}

    void addRaw(vector<long long> &b, int i, long long v) {
        for (++i; i <= n; i += i & -i) b[i] += v;
    }

    long long sumRaw(const vector<long long> &b, int i) const {
        long long r = 0;
        for (++i; i > 0; i -= i & -i) r += b[i];
        return r;
    }

    void add(int l, int r, long long v) {       // add v to [l, r]
        addRaw(b1, l, v);
        addRaw(b1, r + 1, -v);
        addRaw(b2, l, v * (l - 1));
        addRaw(b2, r + 1, -v * r);
    }

    long long prefix(int i) const {             // sum of [0, i]
        return sumRaw(b1, i) * i - sumRaw(b2, i);
    }

    long long sum(int l, int r) const {
        return prefix(r) - (l ? prefix(l - 1) : 0);
    }
};`,
  },
  {
    id: "fenwick-kth",
    name: "Fenwick K-th Element (binary lifting)",
    category: "ds",
    level: "intermediate",
    complexity: "O(log n)",
    tags: ["bit", "order statistic"],
    summary:
      "Descends the BIT to find the smallest index whose prefix count reaches k, giving an order-statistic tree over a value range without a balanced BST.",
    usage: "int v = f.kth(k);   // k-th smallest, 1-indexed k",
    code: String.raw`struct FenwickKth {
    int n, LOG;
    vector<long long> b;

    explicit FenwickKth(int n) : n(n), b(n + 1, 0) {
        LOG = 1;
        while ((1 << (LOG + 1)) <= n) LOG++;
    }

    void add(int i, long long v) { for (++i; i <= n; i += i & -i) b[i] += v; }

    long long sum(int i) const {
        long long r = 0;
        for (++i; i > 0; i -= i & -i) r += b[i];
        return r;
    }

    int kth(long long k) const {            // smallest idx with prefix >= k
        int pos = 0;
        for (int pw = 1 << LOG; pw; pw >>= 1) {
            if (pos + pw <= n && b[pos + pw] < k) {
                pos += pw;
                k -= b[pos];
            }
        }
        return pos;                          // 0-indexed answer
    }
};`,
  },
  {
    id: "fenwick-2d",
    name: "2D Fenwick Tree",
    category: "ds",
    level: "intermediate",
    complexity: "O(log n log m) per op",
    tags: ["bit", "grid"],
    summary:
      "Point update and rectangle sum on a grid. Cheap and short when coordinates are bounded; use a merge-sort tree or offline BIT when they are not.",
    usage: "Fenwick2D f(n, m); f.add(r, c, v); long long s = f.rect(r1, c1, r2, c2);",
    code: String.raw`struct Fenwick2D {
    int n, m;
    vector<vector<long long>> b;

    Fenwick2D(int n, int m) : n(n), m(m), b(n + 1, vector<long long>(m + 1, 0)) {}

    void add(int r, int c, long long v) {
        for (int i = r + 1; i <= n; i += i & -i)
            for (int j = c + 1; j <= m; j += j & -j) b[i][j] += v;
    }

    long long sum(int r, int c) const {          // prefix rectangle [0..r][0..c]
        long long s = 0;
        for (int i = r + 1; i > 0; i -= i & -i)
            for (int j = c + 1; j > 0; j -= j & -j) s += b[i][j];
        return s;
    }

    long long rect(int r1, int c1, int r2, int c2) const {
        if (r1 > r2 || c1 > c2) return 0;
        long long s = sum(r2, c2);
        if (r1) s -= sum(r1 - 1, c2);
        if (c1) s -= sum(r2, c1 - 1);
        if (r1 && c1) s += sum(r1 - 1, c1 - 1);
        return s;
    }
};`,
  },
  {
    id: "segtree",
    name: "Iterative Segment Tree",
    category: "ds",
    level: "intermediate",
    complexity: "O(log n) per op",
    tags: ["segment tree", "range query"],
    summary:
      "Bottom-up segment tree for any associative merge (sum, min, max, gcd). Half the code and roughly twice the speed of the recursive version.",
    usage: "SegTree st(a); st.update(i, v); long long m = st.query(l, r);",
    variants:
      "Change combine + identity for a different monoid; store a struct to answer max-subarray or 'first index >= x'.",
    code: String.raw`struct SegTree {
    int n;
    vector<long long> t;
    static long long combine(long long a, long long b) { return a + b; }
    static const long long ID = 0;

    explicit SegTree(const vector<long long> &a) : n(a.size()), t(2 * a.size(), ID) {
        for (int i = 0; i < n; i++) t[n + i] = a[i];
        for (int i = n - 1; i > 0; i--) t[i] = combine(t[2 * i], t[2 * i + 1]);
    }

    void update(int i, long long v) {
        for (t[i += n] = v; i > 1; i >>= 1) t[i >> 1] = combine(t[i], t[i ^ 1]);
    }

    long long query(int l, int r) const {     // inclusive
        long long resl = ID, resr = ID;
        for (l += n, r += n + 1; l < r; l >>= 1, r >>= 1) {
            if (l & 1) resl = combine(resl, t[l++]);
            if (r & 1) resr = combine(t[--r], resr);
        }
        return combine(resl, resr);
    }
};`,
  },
  {
    id: "segtree-lazy",
    name: "Lazy Segment Tree (range add, range sum)",
    category: "ds",
    level: "advanced",
    complexity: "O(log n) per op",
    tags: ["segment tree", "lazy", "range update"],
    summary:
      "Range update and range query by deferring updates in a lazy tag pushed down only when a child is visited.",
    usage: "LazySeg st(n); st.update(l, r, v); long long s = st.query(l, r);",
    variants:
      "Range assign: replace the tag with (has_set, value). Two tags (mul, add) compose as affine maps — apply mul first.",
    code: String.raw`struct LazySeg {
    int n;
    vector<long long> t, lz;

    explicit LazySeg(int n) : n(n), t(4 * n, 0), lz(4 * n, 0) {}

    void apply_(int node, int l, int r, long long v) {
        t[node] += v * (r - l + 1);
        lz[node] += v;
    }

    void push(int node, int l, int r) {
        if (!lz[node]) return;
        int m = (l + r) / 2;
        apply_(2 * node, l, m, lz[node]);
        apply_(2 * node + 1, m + 1, r, lz[node]);
        lz[node] = 0;
    }

    void update(int ql, int qr, long long v, int node = 1, int l = 0, int r = -1) {
        if (r < 0) r = n - 1;
        if (qr < l || r < ql) return;
        if (ql <= l && r <= qr) { apply_(node, l, r, v); return; }
        push(node, l, r);
        int m = (l + r) / 2;
        update(ql, qr, v, 2 * node, l, m);
        update(ql, qr, v, 2 * node + 1, m + 1, r);
        t[node] = t[2 * node] + t[2 * node + 1];
    }

    long long query(int ql, int qr, int node = 1, int l = 0, int r = -1) {
        if (r < 0) r = n - 1;
        if (qr < l || r < ql) return 0;
        if (ql <= l && r <= qr) return t[node];
        push(node, l, r);
        int m = (l + r) / 2;
        return query(ql, qr, 2 * node, l, m) + query(ql, qr, 2 * node + 1, m + 1, r);
    }
};`,
  },
  {
    id: "segtree-dynamic",
    name: "Dynamic (Sparse) Segment Tree",
    category: "ds",
    level: "advanced",
    complexity: "O(log C) per op, O(q log C) memory",
    tags: ["segment tree", "sparse", "large coordinates"],
    summary:
      "Allocates nodes only where updates land, so it indexes a range up to 1e18 without compression. Handy when queries arrive online.",
    usage: "DynSeg st(0, 1e18); st.update(pos, v); long long s = st.query(l, r);",
    code: String.raw`struct DynSeg {
    struct Node { long long sum = 0; int l = -1, r = -1; };
    vector<Node> nd;
    long long lo, hi;

    DynSeg(long long lo, long long hi) : lo(lo), hi(hi) { nd.push_back({}); }

    void update(long long pos, long long v, int node = 0, long long l = -1, long long r = -1) {
        if (l < 0) { l = lo; r = hi; }
        nd[node].sum += v;
        if (l == r) return;
        long long m = l + (r - l) / 2;
        if (pos <= m) {
            if (nd[node].l < 0) { nd.push_back({}); nd[node].l = nd.size() - 1; }
            update(pos, v, nd[node].l, l, m);
        } else {
            if (nd[node].r < 0) { nd.push_back({}); nd[node].r = nd.size() - 1; }
            update(pos, v, nd[node].r, m + 1, r);
        }
    }

    long long query(long long ql, long long qr, int node = 0, long long l = -1, long long r = -1) {
        if (node < 0) return 0;
        if (l < 0) { l = lo; r = hi; }
        if (qr < l || r < ql) return 0;
        if (ql <= l && r <= qr) return nd[node].sum;
        long long m = l + (r - l) / 2;
        return query(ql, qr, nd[node].l, l, m) + query(ql, qr, nd[node].r, m + 1, r);
    }
};`,
  },
  {
    id: "segtree-persistent",
    name: "Persistent Segment Tree",
    category: "ds",
    level: "advanced",
    complexity: "O(log n) per op and per version",
    tags: ["segment tree", "persistent", "kth"],
    summary:
      "Every update creates a new root sharing untouched subtrees, so all past versions stay queryable. The standard answer to 'k-th smallest in a subarray'.",
    usage: "roots[i+1] = pst.update(roots[i], val, 1); int k = pst.kth(roots[l], roots[r+1], k);",
    code: String.raw`struct PersistentSeg {
    struct Node { int l = 0, r = 0; int cnt = 0; };
    vector<Node> nd;
    int n;                                    // value range size

    explicit PersistentSeg(int n) : n(n) { nd.push_back({}); }   // node 0 = empty

    int update(int prev, int pos, int delta, int l = 0, int r = -1) {
        if (r < 0) r = n - 1;
        nd.push_back(nd[prev]);
        int cur = nd.size() - 1;
        nd[cur].cnt += delta;
        if (l == r) return cur;
        int m = (l + r) / 2;
        if (pos <= m) nd[cur].l = update(nd[prev].l, pos, delta, l, m);
        else nd[cur].r = update(nd[prev].r, pos, delta, m + 1, r);
        return cur;
    }

    // k-th smallest value among elements counted in (rootR - rootL)
    int kth(int rootL, int rootR, int k, int l = 0, int r = -1) {
        if (r < 0) r = n - 1;
        if (l == r) return l;
        int m = (l + r) / 2;
        int leftCnt = nd[nd[rootR].l].cnt - nd[nd[rootL].l].cnt;
        if (k <= leftCnt) return kth(nd[rootL].l, nd[rootR].l, k, l, m);
        return kth(nd[rootL].r, nd[rootR].r, k - leftCnt, m + 1, r);
    }
};`,
  },
  {
    id: "sparse-table",
    name: "Sparse Table (static RMQ)",
    category: "ds",
    level: "intermediate",
    complexity: "O(n log n) build, O(1) query",
    tags: ["rmq", "static", "idempotent"],
    summary:
      "Constant-time min/max/gcd on a static array by storing every power-of-two window. Beats a segment tree when there are no updates.",
    usage: "SparseTable st(a); int mn = st.query(l, r);",
    variants:
      "Only valid for idempotent merges (min, max, gcd, and/or). For sums use prefix sums instead.",
    code: String.raw`struct SparseTable {
    vector<vector<int>> t;
    vector<int> lg;

    explicit SparseTable(const vector<int> &a) {
        int n = a.size(), K = 1;
        while ((1 << K) <= n) K++;
        t.assign(K, vector<int>(n));
        lg.assign(n + 1, 0);
        for (int i = 2; i <= n; i++) lg[i] = lg[i / 2] + 1;
        t[0] = a;
        for (int j = 1; j < K; j++)
            for (int i = 0; i + (1 << j) <= n; i++)
                t[j][i] = min(t[j - 1][i], t[j - 1][i + (1 << (j - 1))]);
    }

    int query(int l, int r) const {           // inclusive
        int j = lg[r - l + 1];
        return min(t[j][l], t[j][r - (1 << j) + 1]);
    }
};`,
  },
  {
    id: "sqrt-decomposition",
    name: "Sqrt Decomposition",
    category: "ds",
    level: "intermediate",
    complexity: "O(sqrt n) per op",
    tags: ["blocks", "range query"],
    summary:
      "Splits the array into blocks of size sqrt(n) with a cached aggregate per block. Slower than a segment tree but accepts operations that do not compose.",
    usage: "SqrtBlocks b(a); b.update(i, v); long long s = b.query(l, r);",
    code: String.raw`struct SqrtBlocks {
    int n, bs;
    vector<long long> a, blk;

    explicit SqrtBlocks(const vector<long long> &src) : n(src.size()), a(src) {
        bs = max(1, (int)sqrt((double)n));
        blk.assign((n + bs - 1) / bs, 0);
        for (int i = 0; i < n; i++) blk[i / bs] += a[i];
    }

    void update(int i, long long v) {
        blk[i / bs] += v - a[i];
        a[i] = v;
    }

    long long query(int l, int r) const {     // inclusive
        long long res = 0;
        while (l <= r) {
            if (l % bs == 0 && l + bs - 1 <= r) { res += blk[l / bs]; l += bs; }
            else res += a[l++];
        }
        return res;
    }
};`,
  },
  {
    id: "mo-algorithm",
    name: "Mo's Algorithm",
    category: "ds",
    level: "advanced",
    complexity: "O((n + q) sqrt n)",
    tags: ["offline", "blocks", "queries"],
    summary:
      "Answers offline range queries by sorting them so the window moves as little as possible. Use it when add/remove of one element is cheap but merging ranges is not.",
    usage: "auto ans = mo(a, queries);   // distinct values per range",
    variants:
      "Hilbert-curve ordering removes the odd/even block trick and is faster; Mo on trees flattens with an Euler tour first.",
    code: String.raw`struct Query { int l, r, idx; };

vector<int> mo(const vector<int> &a, vector<Query> qs) {
    int n = a.size(), bs = max(1, (int)(n / max(1.0, sqrt((double)qs.size()))));
    sort(qs.begin(), qs.end(), [&](const Query &x, const Query &y) {
        int bx = x.l / bs, by = y.l / bs;
        if (bx != by) return bx < by;
        return (bx & 1) ? x.r > y.r : x.r < y.r;      // snake order
    });

    vector<int> cnt(*max_element(a.begin(), a.end()) + 1, 0), ans(qs.size());
    int distinct = 0, L = 0, R = -1;
    auto add = [&](int i) { if (cnt[a[i]]++ == 0) distinct++; };
    auto rem = [&](int i) { if (--cnt[a[i]] == 0) distinct--; };

    for (const auto &q : qs) {
        while (R < q.r) add(++R);
        while (L > q.l) add(--L);
        while (R > q.r) rem(R--);
        while (L < q.l) rem(L++);
        ans[q.idx] = distinct;
    }
    return ans;
}`,
  },
  {
    id: "pbds-ordered-set",
    name: "Ordered Set (GNU pbds)",
    category: "ds",
    level: "intermediate",
    complexity: "O(log n) per op",
    tags: ["balanced bst", "order statistic", "stl"],
    summary:
      "A red-black tree with order-statistic queries: rank of a value and value of a rank, without writing a balanced BST.",
    usage: "ordered_set s; s.insert(x); int rank = s.order_of_key(x);",
    variants:
      "For a multiset, store pair<value, uniqueId> or use less_equal<T> as the comparator (then erase needs find_by_order).",
    code: String.raw`#include <ext/pb_ds/assoc_container.hpp>
#include <ext/pb_ds/tree_policy.hpp>
using namespace __gnu_pbds;

template <class T>
using ordered_set = tree<T, null_type, less<T>, rb_tree_tag,
                         tree_order_statistics_node_update>;

// ordered_set<int> s;
// s.insert(5);
// *s.find_by_order(0)   -> smallest element
// s.order_of_key(5)     -> how many elements are strictly smaller`,
  },
  {
    id: "binary-trie",
    name: "Binary Trie (XOR queries)",
    category: "ds",
    level: "intermediate",
    complexity: "O(bits) per op",
    tags: ["trie", "xor", "bitwise"],
    summary:
      "Stores numbers bit by bit so the maximum XOR with a query, or a count of pairs below a bound, is a greedy root-to-leaf walk.",
    usage: "BinTrie t; t.insert(x); long long best = t.max_xor(y);",
    variants:
      "Keep a counter per node to support deletion and 'count of values with prefix'; add a version index for persistent XOR queries.",
    code: String.raw`struct BinTrie {
    static const int B = 30;
    struct Node { int nxt[2] = {-1, -1}; int cnt = 0; };
    vector<Node> nd{Node()};

    void insert(int x, int delta = 1) {
        int cur = 0;
        for (int i = B; i >= 0; i--) {
            int b = (x >> i) & 1;
            if (nd[cur].nxt[b] < 0) { nd.push_back(Node()); nd[cur].nxt[b] = nd.size() - 1; }
            cur = nd[cur].nxt[b];
            nd[cur].cnt += delta;
        }
    }

    int max_xor(int x) const {
        int cur = 0, res = 0;
        for (int i = B; i >= 0; i--) {
            int want = ((x >> i) & 1) ^ 1;
            int c = nd[cur].nxt[want];
            if (c >= 0 && nd[c].cnt > 0) { res |= 1 << i; cur = c; }
            else cur = nd[cur].nxt[want ^ 1];
            if (cur < 0) break;
        }
        return res;
    }
};`,
  },
  {
    id: "interval-map",
    name: "Interval Set (merge on insert)",
    category: "ds",
    level: "intermediate",
    complexity: "O(log n) amortised",
    tags: ["map", "intervals", "chtholly"],
    summary:
      "Keeps disjoint intervals in a map keyed by left endpoint, merging on insert. Handles 'paint a range with one value' and covered-length queries.",
    usage: "IntervalSet s; s.add(3, 10); s.add(9, 12);   // becomes [3,12]",
    variants:
      "With random data the same structure ('Chtholly tree') makes range-assign plus arbitrary aggregate queries fast in practice.",
    code: String.raw`struct IntervalSet {
    map<long long, long long> iv;            // left -> right, disjoint, non-touching

    void add(long long l, long long r) {     // inclusive
        auto it = iv.upper_bound(l);
        if (it != iv.begin() && prev(it)->second + 1 >= l) {
            --it;
            l = min(l, it->first);
            r = max(r, it->second);
        }
        while (it != iv.end() && it->first <= r + 1) {
            r = max(r, it->second);
            it = iv.erase(it);
        }
        iv[l] = r;
    }

    bool covered(long long x) const {
        auto it = iv.upper_bound(x);
        return it != iv.begin() && prev(it)->second >= x;
    }

    long long total() const {
        long long s = 0;
        for (auto [l, r] : iv) s += r - l + 1;
        return s;
    }
};`,
  },
  {
    id: "lazy-heap",
    name: "Heap with Deletion (two heaps)",
    category: "ds",
    level: "basic",
    complexity: "O(log n) amortised",
    tags: ["heap", "lazy deletion"],
    summary:
      "Simulates 'erase an arbitrary value' on a priority queue by keeping a second heap of pending deletions and skipping matches at the top.",
    usage: "LazyHeap h; h.push(x); h.erase(y); int mx = h.top();",
    code: String.raw`struct LazyHeap {
    priority_queue<int> alive, dead;

    void clean() {
        while (!dead.empty() && !alive.empty() && alive.top() == dead.top()) {
            alive.pop();
            dead.pop();
        }
    }

    void push(int x) { alive.push(x); }
    void erase(int x) { dead.push(x); }

    int top() { clean(); return alive.top(); }
    bool empty() { clean(); return alive.empty(); }
    size_t size() const { return alive.size() - dead.size(); }
};`,
  },
];

export default algos;
