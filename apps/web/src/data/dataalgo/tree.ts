import type { Algo } from "./types";

const algos: Algo[] = [
  {
    id: "subtree-sizes",
    name: "Subtree Sizes & Depths",
    category: "tree",
    level: "basic",
    complexity: "O(n)",
    tags: ["dfs", "tree dp"],
    summary:
      "One DFS filling parent, depth and subtree size. Nearly every tree algorithm starts from these three arrays.",
    usage: "prep(g, 0);   // fills par, dep, sz",
    code: String.raw`vector<int> par, dep, sz;

void prep(const vector<vector<int>> &g, int root) {
    int n = g.size();
    par.assign(n, -1); dep.assign(n, 0); sz.assign(n, 1);
    vector<int> st{root}, order;
    par[root] = -1;
    while (!st.empty()) {                       // iterative: safe for n = 1e6
        int v = st.back(); st.pop_back();
        order.push_back(v);
        for (int u : g[v]) {
            if (u == par[v]) continue;
            par[u] = v;
            dep[u] = dep[v] + 1;
            st.push_back(u);
        }
    }
    for (int i = order.size() - 1; i > 0; i--) sz[par[order[i]]] += sz[order[i]];
}`,
  },
  {
    id: "tree-diameter",
    name: "Tree Diameter",
    category: "tree",
    level: "basic",
    complexity: "O(n)",
    tags: ["bfs", "diameter"],
    summary:
      "Longest path in a tree: BFS from any vertex to find the farthest one, then BFS again from there. The second BFS also yields the path itself.",
    usage: "auto [len, path] = diameter(g);",
    variants:
      "Weighted trees: same two-pass trick with Dijkstra-free DFS. Or DP: best two child depths per vertex.",
    code: String.raw`pair<int, vector<int>> diameter(const vector<vector<int>> &g) {
    int n = g.size();
    auto bfs = [&](int s) {
        vector<int> d(n, -1), par(n, -1);
        queue<int> q{{s}};
        d[s] = 0;
        int last = s;
        while (!q.empty()) {
            int v = q.front(); q.pop();
            last = v;
            for (int u : g[v]) if (d[u] == -1) { d[u] = d[v] + 1; par[u] = v; q.push(u); }
        }
        return make_tuple(last, d, par);
    };
    auto [a, d1, p1] = bfs(0);
    auto [b, d2, p2] = bfs(a);
    vector<int> path;
    for (int v = b; v != -1; v = p2[v]) path.push_back(v);
    return {d2[b], path};
}`,
  },
  {
    id: "lca-binary-lifting",
    name: "LCA with Binary Lifting",
    category: "tree",
    level: "intermediate",
    complexity: "O(n log n) build, O(log n) query",
    tags: ["lca", "binary lifting", "ancestor"],
    summary:
      "Stores 2^j-th ancestors so any k-th ancestor is a bit walk and LCA is two lifts. Also gives tree distance in O(log n).",
    usage: "LCA t(g, 0); int l = t.lca(u, v); int d = t.dist(u, v);",
    variants:
      "Carry an aggregate (max weight, sum) alongside each jump to answer path queries without HLD.",
    code: String.raw`struct LCA {
    int n, LOG;
    vector<vector<int>> up;
    vector<int> dep;

    LCA(const vector<vector<int>> &g, int root) : n(g.size()) {
        LOG = 1;
        while ((1 << LOG) < n) LOG++;
        up.assign(LOG + 1, vector<int>(n, root));
        dep.assign(n, 0);
        vector<int> st{root};
        vector<bool> vis(n, false);
        vis[root] = true;
        while (!st.empty()) {
            int v = st.back(); st.pop_back();
            for (int u : g[v]) {
                if (vis[u]) continue;
                vis[u] = true;
                up[0][u] = v;
                dep[u] = dep[v] + 1;
                st.push_back(u);
            }
        }
        for (int j = 1; j <= LOG; j++)
            for (int v = 0; v < n; v++) up[j][v] = up[j - 1][up[j - 1][v]];
    }

    int kth(int v, int k) const {
        for (int j = 0; j <= LOG && v != -1; j++) if ((k >> j) & 1) v = up[j][v];
        return v;
    }

    int lca(int u, int v) const {
        if (dep[u] < dep[v]) swap(u, v);
        u = kth(u, dep[u] - dep[v]);
        if (u == v) return u;
        for (int j = LOG; j >= 0; j--)
            if (up[j][u] != up[j][v]) { u = up[j][u]; v = up[j][v]; }
        return up[0][u];
    }

    int dist(int u, int v) const { return dep[u] + dep[v] - 2 * dep[lca(u, v)]; }
};`,
  },
  {
    id: "euler-tour-subtree",
    name: "Euler Tour Flattening",
    category: "tree",
    level: "intermediate",
    complexity: "O(n) build, O(log n) per query",
    tags: ["euler tour", "bit", "subtree"],
    summary:
      "Numbering vertices by entry time makes every subtree a contiguous range, so subtree sum/max queries reduce to array queries on a BIT or segment tree.",
    usage: "flatten(g, 0); f.add(tin[v], w); long long s = f.range(tin[v], tout[v]);",
    variants:
      "Storing +1 at entry and -1 at exit turns 'is u an ancestor of v' into a prefix-sum test, and supports path-to-root updates.",
    code: String.raw`vector<int> tin, tout, flat;
int timer_ = 0;

void flatten(const vector<vector<int>> &g, int v, int p = -1) {
    tin[v] = timer_++;
    flat[tin[v]] = v;
    for (int u : g[v]) if (u != p) flatten(g, u, v);
    tout[v] = timer_ - 1;                     // subtree of v = [tin[v], tout[v]]
}

// call: tin.assign(n,0); tout.assign(n,0); flat.assign(n,0); flatten(g, root);`,
  },
  {
    id: "lca-tarjan-offline",
    name: "Offline LCA (Tarjan + DSU)",
    category: "tree",
    level: "advanced",
    complexity: "O((n + q) alpha(n))",
    tags: ["lca", "offline", "dsu"],
    summary:
      "Answers all LCA queries in one DFS by union-ing finished subtrees into their parent. Fastest option when every query is known in advance.",
    usage: "auto ans = lca_offline(g, 0, queries);",
    code: String.raw`vector<int> lca_offline(const vector<vector<int>> &g, int root,
                       const vector<pair<int,int>> &queries) {
    int n = g.size(), q = queries.size();
    vector<vector<pair<int,int>>> qs(n);       // (other, query index)
    for (int i = 0; i < q; i++) {
        qs[queries[i].first].push_back({queries[i].second, i});
        qs[queries[i].second].push_back({queries[i].first, i});
    }
    vector<int> p(n), anc(n), ans(q, -1);
    vector<bool> vis(n, false);
    iota(p.begin(), p.end(), 0);
    function<int(int)> find = [&](int x) { while (p[x] != x) x = p[x] = p[p[x]]; return x; };

    function<void(int,int)> dfs = [&](int v, int par) {
        anc[v] = v;
        vis[v] = true;
        for (int u : g[v]) {
            if (u == par) continue;
            dfs(u, v);
            p[find(u)] = find(v);
            anc[find(v)] = v;
        }
        for (auto [other, idx] : qs[v])
            if (vis[other] && ans[idx] == -1) ans[idx] = anc[find(other)];
    };

    dfs(root, -1);
    return ans;
}`,
  },
  {
    id: "path-max-lifting",
    name: "Path Aggregate via Binary Lifting",
    category: "tree",
    level: "intermediate",
    complexity: "O(n log n) build, O(log n) query",
    tags: ["binary lifting", "path query", "max edge"],
    summary:
      "Carries an aggregate next to each jump pointer, so the maximum edge weight on a path comes out of the same lift as the LCA.",
    usage: "PathMax pm(g, 0); long long mx = pm.query(u, v);",
    variants:
      "Sum needs care: add the two halves without double counting the LCA. Max and min are idempotent so overlap is harmless.",
    code: String.raw`struct PathMax {
    int n, LOG;
    vector<vector<int>> up;
    vector<vector<long long>> mx;
    vector<int> dep;

    PathMax(const vector<vector<pair<int,long long>>> &g, int root) : n(g.size()) {
        LOG = 1;
        while ((1 << LOG) < n) LOG++;
        up.assign(LOG + 1, vector<int>(n, root));
        mx.assign(LOG + 1, vector<long long>(n, LLONG_MIN));
        dep.assign(n, 0);
        vector<bool> vis(n, false);
        vector<int> st{root};
        vis[root] = true;
        while (!st.empty()) {
            int v = st.back(); st.pop_back();
            for (auto [u, w] : g[v]) {
                if (vis[u]) continue;
                vis[u] = true;
                up[0][u] = v; mx[0][u] = w; dep[u] = dep[v] + 1;
                st.push_back(u);
            }
        }
        for (int j = 1; j <= LOG; j++)
            for (int v = 0; v < n; v++) {
                up[j][v] = up[j - 1][up[j - 1][v]];
                mx[j][v] = max(mx[j - 1][v], mx[j - 1][up[j - 1][v]]);
            }
    }

    long long query(int u, int v) {
        long long res = LLONG_MIN;
        if (dep[u] < dep[v]) swap(u, v);
        int diff = dep[u] - dep[v];
        for (int j = 0; j <= LOG; j++)
            if ((diff >> j) & 1) { res = max(res, mx[j][u]); u = up[j][u]; }
        if (u == v) return res;
        for (int j = LOG; j >= 0; j--)
            if (up[j][u] != up[j][v]) {
                res = max({res, mx[j][u], mx[j][v]});
                u = up[j][u]; v = up[j][v];
            }
        return max({res, mx[0][u], mx[0][v]});
    }
};`,
  },
  {
    id: "hld",
    name: "Heavy-Light Decomposition",
    category: "tree",
    level: "advanced",
    complexity: "O(log^2 n) per path query",
    tags: ["hld", "path query", "segment tree"],
    summary:
      "Splits the tree into heavy chains so any root path crosses O(log n) chains, each a contiguous segment-tree range. Gives path updates and path queries on trees.",
    usage: "HLD h(g, 0); h.pathApply(u, v, [&](int l, int r){ seg.update(l, r); });",
    variants:
      "Store values on edges by assigning each edge to its deeper endpoint and skipping the LCA in path queries.",
    code: String.raw`struct HLD {
    int n, timer_ = 0;
    vector<int> par, dep, heavy, head, pos, sz;

    HLD(const vector<vector<int>> &g, int root) : n(g.size()),
        par(n, -1), dep(n, 0), heavy(n, -1), head(n, 0), pos(n, 0), sz(n, 1) {
        dfsSize(g, root, -1);
        decompose(g, root, root);
    }

    void dfsSize(const vector<vector<int>> &g, int v, int p) {
        par[v] = p;
        int best = 0;
        for (int u : g[v]) {
            if (u == p) continue;
            dep[u] = dep[v] + 1;
            dfsSize(g, u, v);
            sz[v] += sz[u];
            if (sz[u] > best) { best = sz[u]; heavy[v] = u; }
        }
    }

    void decompose(const vector<vector<int>> &g, int v, int h) {
        head[v] = h;
        pos[v] = timer_++;
        if (heavy[v] != -1) decompose(g, heavy[v], h);
        for (int u : g[v])
            if (u != par[v] && u != heavy[v]) decompose(g, u, u);
    }

    // calls f(l, r) on each chain segment of the path u..v
    template <class F>
    void pathApply(int u, int v, F f) {
        for (; head[u] != head[v]; v = par[head[v]]) {
            if (dep[head[u]] > dep[head[v]]) swap(u, v);
            f(pos[head[v]], pos[v]);
        }
        if (dep[u] > dep[v]) swap(u, v);
        f(pos[u], pos[v]);                     // drop for edge values
    }
};`,
  },
  {
    id: "centroid-decomposition",
    name: "Centroid Decomposition",
    category: "tree",
    level: "advanced",
    complexity: "O(n log n)",
    tags: ["centroid", "divide and conquer", "paths"],
    summary:
      "Recursively removes a centroid, so every path passes through the centroid of exactly one level. Turns 'count paths with property X' into O(log n) rooted subproblems.",
    usage: "removed_.assign(n,false); sub.assign(n,0); build(g, 0);",
    variants:
      "The centroid tree has depth O(log n), so it also answers 'nearest marked vertex' by walking centroid ancestors.",
    code: String.raw`vector<bool> removed_;
vector<int> sub;

int calcSize(const vector<vector<int>> &g, int v, int p) {
    sub[v] = 1;
    for (int u : g[v])
        if (u != p && !removed_[u]) sub[v] += calcSize(g, u, v);
    return sub[v];
}

int findCentroid(const vector<vector<int>> &g, int v, int p, int total) {
    for (int u : g[v])
        if (u != p && !removed_[u] && sub[u] > total / 2)
            return findCentroid(g, u, v, total);
    return v;
}

void build(const vector<vector<int>> &g, int entry) {
    int total = calcSize(g, entry, -1);
    int c = findCentroid(g, entry, -1, total);
    removed_[c] = true;

    // ---- solve for all paths through c here ----

    for (int u : g[c]) if (!removed_[u]) build(g, u);
}`,
  },
  {
    id: "rerooting-dp",
    name: "Rerooting DP",
    category: "tree",
    level: "advanced",
    complexity: "O(n)",
    tags: ["tree dp", "rerooting", "all roots"],
    summary:
      "Computes the DP value for every vertex as root in linear time: aggregate children going down, then hand each child the complement of its own contribution going up.",
    usage: "auto [ans, cnt] = reroot(g);   // ans[v] = total distance from v",
    code: String.raw`pair<vector<long long>, vector<int>> reroot(const vector<vector<int>> &g) {
    int n = g.size();
    vector<long long> down(n, 0), ans(n, 0);
    vector<int> cnt(n, 1);

    function<void(int,int)> dfs1 = [&](int v, int p) {
        for (int u : g[v]) {
            if (u == p) continue;
            dfs1(u, v);
            cnt[v] += cnt[u];
            down[v] += down[u] + cnt[u];
        }
    };
    function<void(int,int,long long)> dfs2 = [&](int v, int p, long long fromParent) {
        ans[v] = down[v] + fromParent;
        for (int u : g[v]) {
            if (u == p) continue;
            long long rest = ans[v] - (down[u] + cnt[u]);   // drop u's subtree
            dfs2(u, v, rest + (n - cnt[u]));
        }
    };

    dfs1(0, -1);
    dfs2(0, -1, 0);
    return {ans, cnt};
}`,
  },
  {
    id: "small-to-large",
    name: "Small-to-Large Merging (DSU on tree)",
    category: "tree",
    level: "advanced",
    complexity: "O(n log n)",
    tags: ["tree dp", "merging", "sets"],
    summary:
      "Merges child containers into the largest one rather than rebuilding. Each element moves O(log n) times, which makes per-subtree multiset queries affordable.",
    usage: "cnt.assign(n, {}); dfs(g, 0, -1);",
    code: String.raw`vector<map<int,int>> cnt;                 // cnt[v]: value -> occurrences
vector<int> colour, answer;

void dfs(const vector<vector<int>> &g, int v, int p) {
    cnt[v][colour[v]]++;
    for (int u : g[v]) {
        if (u == p) continue;
        dfs(g, u, v);
        if (cnt[u].size() > cnt[v].size()) swap(cnt[u], cnt[v]);   // keep the big one
        for (auto [val, c] : cnt[u]) cnt[v][val] += c;
        cnt[u].clear();
    }
    answer[v] = cnt[v].size();             // e.g. distinct colours in the subtree
}`,
  },
  {
    id: "virtual-tree",
    name: "Virtual (Auxiliary) Tree",
    category: "tree",
    level: "advanced",
    complexity: "O(k log k) per query set",
    tags: ["lca", "compression", "queries"],
    summary:
      "Builds the smallest tree preserving ancestry among k marked vertices by sorting them in Euler order and inserting pairwise LCAs. Lets a per-query DP cost O(k) instead of O(n).",
    usage: "auto edges = virtual_tree(marked, lca, tin);",
    code: String.raw`// needs LCA (binary lifting) and tin[] from an Euler tour
vector<pair<int,int>> virtual_tree(vector<int> nodes, LCA &L, const vector<int> &tin) {
    sort(nodes.begin(), nodes.end(), [&](int a, int b) { return tin[a] < tin[b]; });
    int k = nodes.size();
    for (int i = 0; i + 1 < k; i++) nodes.push_back(L.lca(nodes[i], nodes[i + 1]));
    sort(nodes.begin(), nodes.end(), [&](int a, int b) { return tin[a] < tin[b]; });
    nodes.erase(unique(nodes.begin(), nodes.end()), nodes.end());

    vector<pair<int,int>> edges;
    vector<int> st;
    for (int v : nodes) {
        while (!st.empty() && L.lca(st.back(), v) != st.back()) st.pop_back();
        if (!st.empty()) edges.push_back({st.back(), v});
        st.push_back(v);
    }
    return edges;
}`,
  },
  {
    id: "tree-hashing",
    name: "Tree Isomorphism (canonical hash)",
    category: "tree",
    level: "advanced",
    complexity: "O(n log n)",
    tags: ["hashing", "isomorphism", "canonical form"],
    summary:
      "Hashes a rooted tree from the sorted multiset of child hashes, so two rooted trees are isomorphic exactly when their hashes match. For unrooted trees, root at the centre.",
    usage: "unsigned long long h = tree_hash(g, root, -1);",
    variants:
      "A tree has one or two centres; hash both and take the minimum to get a canonical unrooted form.",
    code: String.raw`unsigned long long splitmix(unsigned long long x) {
    x += 0x9e3779b97f4a7c15ULL;
    x = (x ^ (x >> 30)) * 0xbf58476d1ce4e5b9ULL;
    x = (x ^ (x >> 27)) * 0x94d049bb133111ebULL;
    return x ^ (x >> 31);
}

unsigned long long tree_hash(const vector<vector<int>> &g, int v, int p) {
    vector<unsigned long long> kids;
    for (int u : g[v]) if (u != p) kids.push_back(tree_hash(g, u, v));
    sort(kids.begin(), kids.end());
    unsigned long long h = 1;
    for (unsigned long long k : kids) h = h * 0x100000001b3ULL + splitmix(k);
    return splitmix(h);
}

// centres of an unrooted tree: peel leaves layer by layer until 1-2 remain
vector<int> centres(const vector<vector<int>> &g) {
    int n = g.size();
    vector<int> deg(n), order;
    queue<int> q;
    int remaining = n;
    for (int v = 0; v < n; v++) { deg[v] = g[v].size(); if (deg[v] <= 1) q.push(v); }
    while (remaining > 2) {
        int sz = q.size();
        remaining -= sz;
        while (sz--) {
            int v = q.front(); q.pop();
            for (int u : g[v]) if (--deg[u] == 1) q.push(u);
        }
    }
    while (!q.empty()) { order.push_back(q.front()); q.pop(); }
    return order;
}`,
  },
  {
    id: "kruskal-reconstruction-tree",
    name: "Kruskal Reconstruction Tree",
    category: "tree",
    level: "advanced",
    complexity: "O(E log E)",
    tags: ["mst", "bottleneck", "binary lifting"],
    summary:
      "Turns MST construction into a binary tree whose internal nodes carry edge weights, so the minimum bottleneck between two vertices is the weight at their LCA.",
    usage: "auto [par, weight] = krt(edges, n);   // then LCA on the new tree",
    code: String.raw`struct Edge { int a, b; long long w; };

// returns parent array of a tree with 2n-1 nodes and the weight of each internal node
pair<vector<int>, vector<long long>> krt(vector<Edge> edges, int n) {
    sort(edges.begin(), edges.end(), [](const Edge &x, const Edge &y) { return x.w < y.w; });
    vector<int> p(2 * n), comp(n), par(2 * n, -1);
    vector<long long> weight(2 * n, 0);
    iota(p.begin(), p.end(), 0);
    iota(comp.begin(), comp.end(), 0);
    function<int(int)> find = [&](int x) { while (p[x] != x) x = p[x] = p[p[x]]; return x; };

    int next_ = n;
    for (const auto &e : edges) {
        int ra = find(e.a), rb = find(e.b);
        if (ra == rb) continue;
        par[comp[ra]] = next_;
        par[comp[rb]] = next_;
        weight[next_] = e.w;
        p[rb] = ra;
        comp[ra] = next_;
        next_++;
    }
    return {par, weight};
}`,
  },
  {
    id: "prufer",
    name: "Prufer Sequence",
    category: "tree",
    level: "advanced",
    complexity: "O(n)",
    tags: ["bijection", "counting", "labelled trees"],
    summary:
      "A bijection between labelled trees on n vertices and sequences of length n-2, which is why there are n^(n-2) such trees. Useful for constructive and counting tasks.",
    usage: "auto seq = to_prufer(g);   auto edges = from_prufer(seq);",
    code: String.raw`vector<int> to_prufer(const vector<vector<int>> &g) {
    int n = g.size();
    vector<int> deg(n), par(n, -1), seq;
    function<void(int,int)> dfs = [&](int v, int p) {
        par[v] = p;
        for (int u : g[v]) if (u != p) dfs(u, v);
    };
    dfs(n - 1, -1);
    for (int v = 0; v < n; v++) deg[v] = g[v].size();

    int ptr = 0;
    while (deg[ptr] != 1) ptr++;
    int leaf = ptr;
    for (int i = 0; i < n - 2; i++) {
        int next_ = par[leaf];
        seq.push_back(next_);
        if (--deg[next_] == 1 && next_ < ptr) leaf = next_;
        else { ptr++; while (deg[ptr] != 1) ptr++; leaf = ptr; }
    }
    return seq;
}

vector<pair<int,int>> from_prufer(const vector<int> &seq) {
    int m = seq.size(), n = m + 2;
    vector<int> deg(n, 1);
    for (int x : seq) deg[x]++;
    set<int> leaves;
    for (int v = 0; v < n; v++) if (deg[v] == 1) leaves.insert(v);

    vector<pair<int,int>> edges;
    for (int x : seq) {
        int leaf = *leaves.begin();
        leaves.erase(leaves.begin());
        edges.push_back({leaf, x});
        if (--deg[x] == 1) leaves.insert(x);
    }
    edges.push_back({*leaves.begin(), n - 1});
    return edges;
}`,
  },
];

export default algos;
