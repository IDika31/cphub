import type { Algo } from "./types";

const algos: Algo[] = [
  {
    id: "bfs",
    name: "BFS & Unweighted Shortest Path",
    category: "graph",
    level: "basic",
    complexity: "O(V + E)",
    tags: ["bfs", "shortest path"],
    summary:
      "Layer-by-layer traversal giving the minimum number of edges from a source, plus parent pointers for path reconstruction.",
    usage: "auto [dist, par] = bfs(g, s); auto path = restore(par, t);",
    variants:
      "Multi-source: push every source with distance 0. Grids: iterate the four direction deltas instead of an adjacency list.",
    code: String.raw`pair<vector<int>, vector<int>> bfs(const vector<vector<int>> &g, int s) {
    int n = g.size();
    vector<int> dist(n, -1), par(n, -1);
    queue<int> q;
    dist[s] = 0;
    q.push(s);
    while (!q.empty()) {
        int v = q.front(); q.pop();
        for (int u : g[v]) {
            if (dist[u] != -1) continue;
            dist[u] = dist[v] + 1;
            par[u] = v;
            q.push(u);
        }
    }
    return {dist, par};
}

vector<int> restore(const vector<int> &par, int t) {
    vector<int> path;
    for (int v = t; v != -1; v = par[v]) path.push_back(v);
    reverse(path.begin(), path.end());
    return path;
}`,
  },
  {
    id: "dfs",
    name: "DFS (recursive & iterative)",
    category: "graph",
    level: "basic",
    complexity: "O(V + E)",
    tags: ["dfs", "traversal"],
    summary:
      "Depth-first traversal with entry/exit timestamps. The iterative form matters when depth can reach 1e5+ and the stack would overflow.",
    usage: "dfs(g, 0);   // or dfs_iter(g, 0)",
    variants:
      "tin/tout give subtree ranges for an Euler tour; ancestor test is tin[u] <= tin[v] && tout[v] <= tout[u].",
    code: String.raw`vector<int> visited, tin, tout;
int timer_ = 0;

void dfs(const vector<vector<int>> &g, int v) {
    visited[v] = 1;
    tin[v] = timer_++;
    for (int u : g[v]) if (!visited[u]) dfs(g, u);
    tout[v] = timer_++;
}

void dfs_iter(const vector<vector<int>> &g, int s) {
    int n = g.size();
    vector<int> vis(n, 0), it(n, 0);
    vector<int> st{s};
    vis[s] = 1;
    while (!st.empty()) {
        int v = st.back();
        if (it[v] < (int)g[v].size()) {
            int u = g[v][it[v]++];
            if (!vis[u]) { vis[u] = 1; st.push_back(u); }
        } else {
            st.pop_back();                 // post-order position
        }
    }
}`,
  },
  {
    id: "connected-components",
    name: "Connected Components",
    category: "graph",
    level: "basic",
    complexity: "O(V + E)",
    tags: ["components", "flood fill"],
    summary:
      "Labels every vertex with its component id and returns the component count. Same routine flood-fills a grid.",
    usage: "auto [comp, cnt] = components(g);",
    code: String.raw`pair<vector<int>, int> components(const vector<vector<int>> &g) {
    int n = g.size(), cnt = 0;
    vector<int> comp(n, -1);
    for (int s = 0; s < n; s++) {
        if (comp[s] != -1) continue;
        queue<int> q{{s}};
        comp[s] = cnt;
        while (!q.empty()) {
            int v = q.front(); q.pop();
            for (int u : g[v]) if (comp[u] == -1) { comp[u] = cnt; q.push(u); }
        }
        cnt++;
    }
    return {comp, cnt};
}`,
  },
  {
    id: "bipartite-check",
    name: "Bipartite Check (2-colouring)",
    category: "graph",
    level: "basic",
    complexity: "O(V + E)",
    tags: ["bipartite", "colouring"],
    summary:
      "Two-colours each component by BFS; a conflicting edge proves an odd cycle. Prerequisite for matching and many 'split into two groups' reductions.",
    usage: "vector<int> side; if (is_bipartite(g, side)) ...",
    code: String.raw`bool is_bipartite(const vector<vector<int>> &g, vector<int> &side) {
    int n = g.size();
    side.assign(n, -1);
    for (int s = 0; s < n; s++) {
        if (side[s] != -1) continue;
        side[s] = 0;
        queue<int> q{{s}};
        while (!q.empty()) {
            int v = q.front(); q.pop();
            for (int u : g[v]) {
                if (side[u] == -1) { side[u] = side[v] ^ 1; q.push(u); }
                else if (side[u] == side[v]) return false;
            }
        }
    }
    return true;
}`,
  },
  {
    id: "topological-sort",
    name: "Topological Sort (Kahn)",
    category: "graph",
    level: "basic",
    complexity: "O(V + E)",
    tags: ["dag", "ordering"],
    summary:
      "Orders a DAG so every edge points forward, by repeatedly taking a vertex of in-degree zero. A short result means the graph has a cycle.",
    usage: "auto order = topo_sort(g); if (order.size() < n) /* cycle */",
    variants:
      "Use a priority_queue for the lexicographically smallest order; DFS post-order reversed gives the same set of valid orders.",
    code: String.raw`vector<int> topo_sort(const vector<vector<int>> &g) {
    int n = g.size();
    vector<int> deg(n, 0), order;
    for (int v = 0; v < n; v++) for (int u : g[v]) deg[u]++;
    queue<int> q;
    for (int v = 0; v < n; v++) if (!deg[v]) q.push(v);
    while (!q.empty()) {
        int v = q.front(); q.pop();
        order.push_back(v);
        for (int u : g[v]) if (--deg[u] == 0) q.push(u);
    }
    return order;                          // size < n  =>  cycle exists
}`,
  },
  {
    id: "cycle-directed",
    name: "Cycle Detection (directed, 3-colour)",
    category: "graph",
    level: "intermediate",
    complexity: "O(V + E)",
    tags: ["cycle", "dfs", "directed"],
    summary:
      "Finds and reconstructs a directed cycle: white/grey/black colouring, where an edge into a grey vertex closes a back edge.",
    usage: "auto cyc = find_cycle_directed(g);   // empty when acyclic",
    code: String.raw`vector<int> find_cycle_directed(const vector<vector<int>> &g) {
    int n = g.size();
    vector<int> color(n, 0), par(n, -1), cycle;
    int start = -1, end_ = -1;

    function<bool(int)> dfs = [&](int v) -> bool {
        color[v] = 1;
        for (int u : g[v]) {
            if (color[u] == 0) {
                par[u] = v;
                if (dfs(u)) return true;
            } else if (color[u] == 1) {
                start = u; end_ = v;
                return true;
            }
        }
        color[v] = 2;
        return false;
    };

    for (int v = 0; v < n; v++)
        if (color[v] == 0 && dfs(v)) break;
    if (start == -1) return {};

    for (int v = end_; v != start; v = par[v]) cycle.push_back(v);
    cycle.push_back(start);
    reverse(cycle.begin(), cycle.end());
    return cycle;
}`,
  },
  {
    id: "cycle-undirected",
    name: "Cycle Detection (undirected)",
    category: "graph",
    level: "intermediate",
    complexity: "O(V + E)",
    tags: ["cycle", "dfs", "undirected"],
    summary:
      "DFS that ignores the edge back to the parent; any other visited neighbour closes a cycle. Reconstructs the cycle vertices.",
    usage: "auto cyc = find_cycle_undirected(g);",
    variants:
      "With multi-edges, track the edge id instead of the parent vertex so a doubled edge counts as a cycle.",
    code: String.raw`vector<int> find_cycle_undirected(const vector<vector<int>> &g) {
    int n = g.size();
    vector<int> vis(n, 0), par(n, -1), cycle;
    int start = -1, end_ = -1;

    function<bool(int,int)> dfs = [&](int v, int p) -> bool {
        vis[v] = 1;
        for (int u : g[v]) {
            if (u == p) continue;             // skip the edge we came from
            if (vis[u]) { start = u; end_ = v; return true; }
            par[u] = v;
            if (dfs(u, v)) return true;
        }
        vis[v] = 2;
        return false;
    };

    for (int v = 0; v < n; v++)
        if (!vis[v] && dfs(v, -1)) break;
    if (start == -1) return {};

    for (int v = end_; v != start; v = par[v]) cycle.push_back(v);
    cycle.push_back(start);
    return cycle;
}`,
  },
  {
    id: "dijkstra",
    name: "Dijkstra (binary heap)",
    category: "graph",
    level: "basic",
    complexity: "O((V + E) log V)",
    tags: ["shortest path", "heap", "non-negative"],
    summary:
      "Single-source shortest paths with non-negative weights. Lazy deletion (skip stale heap entries) keeps it to one array and one priority queue.",
    usage: "auto [dist, par] = dijkstra(g, s);   // g: vector<vector<pair<int,long long>>>",
    variants:
      "Negative weights need Bellman-Ford or Johnson. For 0/1 weights use 0-1 BFS. Dense graphs: the O(V^2) scan is faster.",
    code: String.raw`const long long INF = (long long)4e18;

pair<vector<long long>, vector<int>> dijkstra(
        const vector<vector<pair<int,long long>>> &g, int s) {
    int n = g.size();
    vector<long long> dist(n, INF);
    vector<int> par(n, -1);
    priority_queue<pair<long long,int>, vector<pair<long long,int>>,
                   greater<pair<long long,int>>> pq;
    dist[s] = 0;
    pq.push({0, s});
    while (!pq.empty()) {
        auto [d, v] = pq.top(); pq.pop();
        if (d != dist[v]) continue;            // stale entry
        for (auto [u, w] : g[v]) {
            if (dist[v] + w < dist[u]) {
                dist[u] = dist[v] + w;
                par[u] = v;
                pq.push({dist[u], u});
            }
        }
    }
    return {dist, par};
}`,
  },
  {
    id: "dijkstra-dense",
    name: "Dijkstra for Dense Graphs",
    category: "graph",
    level: "intermediate",
    complexity: "O(V^2 + E)",
    tags: ["shortest path", "dense"],
    summary:
      "Picks the next vertex by linear scan instead of a heap. Faster when E is close to V^2, and it avoids heap memory entirely.",
    usage: "auto dist = dijkstra_dense(w, s);   // w[i][j] = weight or INF",
    code: String.raw`const long long INF = (long long)4e18;

vector<long long> dijkstra_dense(const vector<vector<long long>> &w, int s) {
    int n = w.size();
    vector<long long> dist(n, INF);
    vector<bool> used(n, false);
    dist[s] = 0;
    for (int it = 0; it < n; it++) {
        int v = -1;
        for (int i = 0; i < n; i++)
            if (!used[i] && (v == -1 || dist[i] < dist[v])) v = i;
        if (v == -1 || dist[v] == INF) break;
        used[v] = true;
        for (int u = 0; u < n; u++)
            if (w[v][u] < INF && dist[v] + w[v][u] < dist[u])
                dist[u] = dist[v] + w[v][u];
    }
    return dist;
}`,
  },
  {
    id: "bfs-01",
    name: "0-1 BFS (deque)",
    category: "graph",
    level: "intermediate",
    complexity: "O(V + E)",
    tags: ["shortest path", "deque"],
    summary:
      "Shortest paths when every weight is 0 or 1: push zero-weight neighbours to the front and weight-one to the back, so the deque stays sorted.",
    usage: "auto dist = bfs01(g, s);",
    variants:
      "Dial's algorithm generalises this to small integer weights with C+1 buckets.",
    code: String.raw`vector<int> bfs01(const vector<vector<pair<int,int>>> &g, int s) {
    int n = g.size();
    vector<int> dist(n, INT_MAX);
    deque<int> dq;
    dist[s] = 0;
    dq.push_back(s);
    while (!dq.empty()) {
        int v = dq.front(); dq.pop_front();
        for (auto [u, w] : g[v]) {
            if (dist[v] + w < dist[u]) {
                dist[u] = dist[v] + w;
                if (w == 0) dq.push_front(u);
                else dq.push_back(u);
            }
        }
    }
    return dist;
}`,
  },
  {
    id: "bellman-ford",
    name: "Bellman-Ford & Negative Cycles",
    category: "graph",
    level: "intermediate",
    complexity: "O(V * E)",
    tags: ["shortest path", "negative weights"],
    summary:
      "Relaxes every edge V-1 times, so it handles negative weights; a relaxation on the V-th pass exposes (and locates) a negative cycle.",
    usage: "auto d = bellman_ford(edges, n, s, negCycle);",
    code: String.raw`struct Edge { int a, b; long long w; };
const long long INF = (long long)4e18;

vector<long long> bellman_ford(const vector<Edge> &edges, int n, int s, bool &negCycle) {
    vector<long long> dist(n, INF);
    dist[s] = 0;
    negCycle = false;
    for (int i = 0; i < n; i++) {
        bool changed = false;
        for (const auto &e : edges) {
            if (dist[e.a] == INF) continue;
            if (dist[e.a] + e.w < dist[e.b]) {
                dist[e.b] = dist[e.a] + e.w;
                changed = true;
                if (i == n - 1) negCycle = true;
            }
        }
        if (!changed) break;
    }
    return dist;
}`,
  },
  {
    id: "floyd-warshall",
    name: "Floyd-Warshall",
    category: "graph",
    level: "basic",
    complexity: "O(V^3)",
    tags: ["all pairs", "shortest path", "closure"],
    summary:
      "All-pairs shortest paths by allowing one intermediate vertex at a time. The same triple loop computes transitive closure and min-max bottleneck paths.",
    usage: "floyd(d);   // d[i][j] = weight, INF if absent, 0 on diagonal",
    variants:
      "Swap (min, +) for (or, and) to get reachability, or for (max, min) to get widest-path/bottleneck.",
    code: String.raw`const long long INF = (long long)1e18;

void floyd(vector<vector<long long>> &d) {
    int n = d.size();
    for (int k = 0; k < n; k++)
        for (int i = 0; i < n; i++) {
            if (d[i][k] == INF) continue;
            for (int j = 0; j < n; j++) {
                if (d[k][j] == INF) continue;
                d[i][j] = min(d[i][j], d[i][k] + d[k][j]);
            }
        }
    // d[i][i] < 0 for some i  =>  negative cycle reachable from i
}`,
  },
  {
    id: "kruskal",
    name: "Kruskal MST",
    category: "graph",
    level: "basic",
    complexity: "O(E log E)",
    tags: ["mst", "dsu", "greedy"],
    summary:
      "Sorts edges and adds each one whose endpoints are still separate. Also builds the minimum bottleneck structure used by Kruskal reconstruction trees.",
    usage: "auto [cost, used] = kruskal(edges, n);",
    variants:
      "Maximum spanning tree: sort descending. Second-best MST: for each tree edge, replace it with the lightest crossing edge.",
    code: String.raw`struct Edge { int a, b; long long w; };

pair<long long, vector<Edge>> kruskal(vector<Edge> edges, int n) {
    sort(edges.begin(), edges.end(), [](const Edge &x, const Edge &y) { return x.w < y.w; });
    vector<int> p(n);
    iota(p.begin(), p.end(), 0);
    function<int(int)> find = [&](int x) { while (p[x] != x) x = p[x] = p[p[x]]; return x; };

    long long cost = 0;
    vector<Edge> used;
    for (const auto &e : edges) {
        int ra = find(e.a), rb = find(e.b);
        if (ra == rb) continue;
        p[rb] = ra;
        cost += e.w;
        used.push_back(e);
    }
    return {cost, used};                   // used.size() < n-1  =>  disconnected
}`,
  },
  {
    id: "prim",
    name: "Prim MST",
    category: "graph",
    level: "intermediate",
    complexity: "O(E log V)",
    tags: ["mst", "heap", "greedy"],
    summary:
      "Grows one tree, always taking the cheapest edge leaving it. Preferable to Kruskal on dense graphs, especially in the O(V^2) array form.",
    usage: "long long cost = prim(g, 0);",
    code: String.raw`const long long INF = (long long)4e18;

long long prim(const vector<vector<pair<int,long long>>> &g, int s) {
    int n = g.size();
    vector<long long> best(n, INF);
    vector<bool> inTree(n, false);
    priority_queue<pair<long long,int>, vector<pair<long long,int>>,
                   greater<pair<long long,int>>> pq;
    long long cost = 0;
    best[s] = 0;
    pq.push({0, s});
    while (!pq.empty()) {
        auto [w, v] = pq.top(); pq.pop();
        if (inTree[v]) continue;
        inTree[v] = true;
        cost += w;
        for (auto [u, wu] : g[v])
            if (!inTree[u] && wu < best[u]) { best[u] = wu; pq.push({wu, u}); }
    }
    return cost;
}`,
  },
  {
    id: "scc-tarjan",
    name: "Strongly Connected Components (Tarjan)",
    category: "graph",
    level: "advanced",
    complexity: "O(V + E)",
    tags: ["scc", "low-link", "condensation"],
    summary:
      "One DFS pass with low-link values. Components come out in reverse topological order of the condensation, which is exactly what DP on the DAG needs.",
    usage: "auto [comp, cnt] = scc_tarjan(g);",
    code: String.raw`pair<vector<int>, int> scc_tarjan(const vector<vector<int>> &g) {
    int n = g.size(), timer_ = 0, cnt = 0;
    vector<int> low(n, 0), num(n, -1), comp(n, -1), st;
    vector<bool> onStack(n, false);

    function<void(int)> dfs = [&](int v) {
        low[v] = num[v] = timer_++;
        st.push_back(v);
        onStack[v] = true;
        for (int u : g[v]) {
            if (num[u] == -1) { dfs(u); low[v] = min(low[v], low[u]); }
            else if (onStack[u]) low[v] = min(low[v], num[u]);
        }
        if (low[v] == num[v]) {
            while (true) {
                int u = st.back(); st.pop_back();
                onStack[u] = false;
                comp[u] = cnt;
                if (u == v) break;
            }
            cnt++;
        }
    };

    for (int v = 0; v < n; v++) if (num[v] == -1) dfs(v);
    return {comp, cnt};
}`,
  },
  {
    id: "scc-kosaraju",
    name: "Strongly Connected Components (Kosaraju)",
    category: "graph",
    level: "intermediate",
    complexity: "O(V + E)",
    tags: ["scc", "reverse graph"],
    summary:
      "Two passes: DFS order on the graph, then DFS on the reverse graph in that order. Easier to get right than Tarjan and yields topological component ids.",
    usage: "auto [comp, cnt] = scc_kosaraju(g, rg);",
    code: String.raw`pair<vector<int>, int> scc_kosaraju(const vector<vector<int>> &g,
                                   const vector<vector<int>> &rg) {
    int n = g.size(), cnt = 0;
    vector<int> order, comp(n, -1);
    vector<bool> vis(n, false);

    function<void(int)> dfs1 = [&](int v) {
        vis[v] = true;
        for (int u : g[v]) if (!vis[u]) dfs1(u);
        order.push_back(v);
    };
    function<void(int)> dfs2 = [&](int v) {
        comp[v] = cnt;
        for (int u : rg[v]) if (comp[u] == -1) dfs2(u);
    };

    for (int v = 0; v < n; v++) if (!vis[v]) dfs1(v);
    reverse(order.begin(), order.end());
    for (int v : order) if (comp[v] == -1) { dfs2(v); cnt++; }
    return {comp, cnt};
}`,
  },
  {
    id: "bridges",
    name: "Bridges (Tarjan low-link)",
    category: "graph",
    level: "advanced",
    complexity: "O(V + E)",
    tags: ["bridges", "low-link", "2-edge-connectivity"],
    summary:
      "Edges whose removal disconnects the graph. Contracting non-bridge edges yields the bridge tree, turning path queries into tree queries.",
    usage: "auto br = bridges(g);   // g holds (neighbour, edgeId)",
    variants:
      "Pass the edge id rather than the parent vertex so parallel edges are handled correctly.",
    code: String.raw`vector<int> bridges(const vector<vector<pair<int,int>>> &g) {
    int n = g.size(), timer_ = 0;
    vector<int> tin(n, -1), low(n, 0), res;

    function<void(int,int)> dfs = [&](int v, int pe) {
        tin[v] = low[v] = timer_++;
        for (auto [u, id] : g[v]) {
            if (id == pe) continue;            // same edge, not just same vertex
            if (tin[u] != -1) { low[v] = min(low[v], tin[u]); continue; }
            dfs(u, id);
            low[v] = min(low[v], low[u]);
            if (low[u] > tin[v]) res.push_back(id);
        }
    };

    for (int v = 0; v < n; v++) if (tin[v] == -1) dfs(v, -1);
    return res;
}`,
  },
  {
    id: "articulation-points",
    name: "Articulation Points",
    category: "graph",
    level: "advanced",
    complexity: "O(V + E)",
    tags: ["cut vertices", "low-link", "biconnectivity"],
    summary:
      "Vertices whose removal increases the component count. The root is special: it is a cut vertex only when it has two or more DFS children.",
    usage: "auto cut = articulation_points(g);",
    code: String.raw`vector<int> articulation_points(const vector<vector<int>> &g) {
    int n = g.size(), timer_ = 0;
    vector<int> tin(n, -1), low(n, 0);
    vector<bool> isCut(n, false);

    function<void(int,int)> dfs = [&](int v, int p) {
        tin[v] = low[v] = timer_++;
        int children = 0;
        for (int u : g[v]) {
            if (u == p) continue;
            if (tin[u] != -1) { low[v] = min(low[v], tin[u]); continue; }
            dfs(u, v);
            low[v] = min(low[v], low[u]);
            if (low[u] >= tin[v] && p != -1) isCut[v] = true;
            children++;
        }
        if (p == -1 && children > 1) isCut[v] = true;
    };

    for (int v = 0; v < n; v++) if (tin[v] == -1) dfs(v, -1);
    vector<int> res;
    for (int v = 0; v < n; v++) if (isCut[v]) res.push_back(v);
    return res;
}`,
  },
  {
    id: "euler-path",
    name: "Eulerian Path (Hierholzer)",
    category: "graph",
    level: "advanced",
    complexity: "O(V + E)",
    tags: ["euler", "traversal"],
    summary:
      "Walks every edge exactly once. Exists in a directed graph when in-degree equals out-degree everywhere (circuit) or differs by one at two vertices (path).",
    usage: "auto path = euler_path_directed(g, start);",
    variants:
      "Undirected: keep a used[] flag per edge id and require all degrees even (or exactly two odd).",
    code: String.raw`// g[v] = list of neighbours; consumes edges with an iterator per vertex
vector<int> euler_path_directed(vector<vector<int>> g, int start) {
    int m = 0;
    for (auto &adj : g) m += adj.size();
    vector<int> it(g.size(), 0), st{start}, path;
    while (!st.empty()) {
        int v = st.back();
        if (it[v] < (int)g[v].size()) st.push_back(g[v][it[v]++]);
        else { path.push_back(v); st.pop_back(); }
    }
    reverse(path.begin(), path.end());
    if ((int)path.size() != m + 1) return {};   // graph not Eulerian
    return path;
}`,
  },
  {
    id: "functional-graph",
    name: "Functional Graph (successor jumps)",
    category: "graph",
    level: "intermediate",
    complexity: "O(n log k) or O(n) per cycle",
    tags: ["functional graph", "binary lifting", "cycle"],
    summary:
      "Every vertex has exactly one outgoing edge, so the structure is trees hanging off cycles. Binary lifting answers 'where am I after k steps'.",
    usage: "auto up = build_lift(next_, LOG); int v = jump(up, s, k);",
    variants:
      "Tortoise-and-hare finds the cycle in O(1) memory; per-vertex cycle length comes from one traversal with visit stamps.",
    code: String.raw`vector<vector<int>> build_lift(const vector<int> &next_, int LOG) {
    int n = next_.size();
    vector<vector<int>> up(LOG, vector<int>(n));
    up[0] = next_;
    for (int j = 1; j < LOG; j++)
        for (int v = 0; v < n; v++) up[j][v] = up[j - 1][up[j - 1][v]];
    return up;
}

int jump(const vector<vector<int>> &up, int v, long long k) {
    for (int j = 0; j < (int)up.size(); j++)
        if ((k >> j) & 1) v = up[j][v];
    return v;
}

// cycle length reachable from every vertex, one pass with visit stamps
vector<int> cycle_lengths(const vector<int> &next_) {
    int n = next_.size();
    vector<int> state(n, 0), len(n, 0), order;
    for (int s = 0; s < n; s++) {
        if (state[s]) continue;
        int v = s;
        order.clear();
        while (state[v] == 0) { state[v] = 1; order.push_back(v); v = next_[v]; }
        int add = 0;
        if (state[v] == 1) {                     // found a fresh cycle
            int c = 0, u = v;
            do { c++; u = next_[u]; } while (u != v);
            u = v;
            do { len[u] = c; state[u] = 2; u = next_[u]; } while (u != v);
            add = c;
        }
        for (int i = order.size() - 1; i >= 0; i--) {
            int x = order[i];
            if (state[x] == 2) continue;
            len[x] = len[next_[x]];
            state[x] = 2;
        }
        (void)add;
    }
    return len;
}`,
  },
];

export default algos;
