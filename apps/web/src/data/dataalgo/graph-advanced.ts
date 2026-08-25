import type { Algo } from "./types";

const algos: Algo[] = [
  {
    id: "dinic",
    name: "Max Flow (Dinic)",
    category: "graph-advanced",
    level: "advanced",
    complexity: "O(V^2 E), O(E sqrt V) on unit capacities",
    tags: ["max flow", "min cut"],
    summary:
      "Level graph plus blocking flows. The default max-flow implementation: fast enough for matching, project selection and most contest flow models.",
    usage: "Dinic d(n); d.addEdge(u, v, cap); long long f = d.maxflow(s, t);",
    variants:
      "Undirected edge: add it with equal capacity in both directions. Vertex capacity: split the vertex into in/out.",
    code: String.raw`struct Dinic {
    struct E { int to; long long cap; };
    vector<E> e;
    vector<vector<int>> g;
    vector<int> level, it;

    explicit Dinic(int n) : g(n), level(n), it(n) {}

    void addEdge(int a, int b, long long cap) {
        g[a].push_back(e.size()); e.push_back({b, cap});
        g[b].push_back(e.size()); e.push_back({a, 0});
    }

    bool bfs(int s, int t) {
        fill(level.begin(), level.end(), -1);
        queue<int> q{{s}};
        level[s] = 0;
        while (!q.empty()) {
            int v = q.front(); q.pop();
            for (int id : g[v]) {
                if (e[id].cap <= 0 || level[e[id].to] != -1) continue;
                level[e[id].to] = level[v] + 1;
                q.push(e[id].to);
            }
        }
        return level[t] != -1;
    }

    long long dfs(int v, int t, long long f) {
        if (v == t || f == 0) return f;
        for (int &i = it[v]; i < (int)g[v].size(); i++) {
            int id = g[v][i], u = e[id].to;
            if (e[id].cap <= 0 || level[u] != level[v] + 1) continue;
            long long d = dfs(u, t, min(f, e[id].cap));
            if (d > 0) { e[id].cap -= d; e[id ^ 1].cap += d; return d; }
        }
        return 0;
    }

    long long maxflow(int s, int t) {
        long long flow = 0;
        while (bfs(s, t)) {
            fill(it.begin(), it.end(), 0);
            while (long long f = dfs(s, t, (long long)4e18)) flow += f;
        }
        return flow;
    }

    // after maxflow: vertices reachable from s in the residual graph = S side
    vector<bool> minCutSide(int s) {
        vector<bool> vis(g.size(), false);
        queue<int> q{{s}};
        vis[s] = true;
        while (!q.empty()) {
            int v = q.front(); q.pop();
            for (int id : g[v])
                if (e[id].cap > 0 && !vis[e[id].to]) { vis[e[id].to] = true; q.push(e[id].to); }
        }
        return vis;
    }
};`,
  },
  {
    id: "edmonds-karp",
    name: "Max Flow (Edmonds-Karp)",
    category: "graph-advanced",
    level: "intermediate",
    complexity: "O(V E^2)",
    tags: ["max flow", "bfs"],
    summary:
      "Repeatedly augments along the shortest path found by BFS. Slower than Dinic but short, and enough when the graph is small or capacities are tiny.",
    usage: "long long f = edmonds_karp(cap, s, t);   // cap is a matrix",
    code: String.raw`long long edmonds_karp(vector<vector<long long>> cap, int s, int t) {
    int n = cap.size();
    long long flow = 0;
    while (true) {
        vector<int> par(n, -1);
        par[s] = s;
        queue<int> q{{s}};
        while (!q.empty() && par[t] == -1) {
            int v = q.front(); q.pop();
            for (int u = 0; u < n; u++)
                if (par[u] == -1 && cap[v][u] > 0) { par[u] = v; q.push(u); }
        }
        if (par[t] == -1) return flow;

        long long push = (long long)4e18;
        for (int v = t; v != s; v = par[v]) push = min(push, cap[par[v]][v]);
        for (int v = t; v != s; v = par[v]) {
            cap[par[v]][v] -= push;
            cap[v][par[v]] += push;
        }
        flow += push;
    }
}`,
  },
  {
    id: "mcmf",
    name: "Min Cost Max Flow (SPFA)",
    category: "graph-advanced",
    level: "advanced",
    complexity: "O(F * V E) worst case",
    tags: ["min cost flow", "spfa", "assignment"],
    summary:
      "Augments along the cheapest path each round, so the result is a maximum flow of minimum total cost. Handles negative edge costs via Bellman-Ford relaxation.",
    usage: "MCMF f(n); f.addEdge(u, v, cap, cost); auto [flow, cost] = f.run(s, t);",
    variants:
      "Cap the number of augmentations to get 'min cost flow of exactly k units'; use Johnson potentials plus Dijkstra when all costs are non-negative.",
    code: String.raw`struct MCMF {
    struct E { int to; long long cap, cost; };
    vector<E> e;
    vector<vector<int>> g;
    int n;

    explicit MCMF(int n) : g(n), n(n) {}

    void addEdge(int a, int b, long long cap, long long cost) {
        g[a].push_back(e.size()); e.push_back({b, cap, cost});
        g[b].push_back(e.size()); e.push_back({a, 0, -cost});
    }

    pair<long long,long long> run(int s, int t) {
        long long flow = 0, cost = 0;
        const long long INF = (long long)4e18;
        while (true) {
            vector<long long> dist(n, INF);
            vector<int> inq(n, 0), pe(n, -1);
            deque<int> dq{s};
            dist[s] = 0;
            while (!dq.empty()) {
                int v = dq.front(); dq.pop_front();
                inq[v] = 0;
                for (int id : g[v]) {
                    if (e[id].cap <= 0) continue;
                    int u = e[id].to;
                    if (dist[v] + e[id].cost < dist[u]) {
                        dist[u] = dist[v] + e[id].cost;
                        pe[u] = id;
                        if (!inq[u]) { inq[u] = 1; dq.push_back(u); }
                    }
                }
            }
            if (dist[t] == INF) break;

            long long push = INF;
            for (int v = t; v != s; v = e[pe[v] ^ 1].to) push = min(push, e[pe[v]].cap);
            for (int v = t; v != s; v = e[pe[v] ^ 1].to) {
                e[pe[v]].cap -= push;
                e[pe[v] ^ 1].cap += push;
            }
            flow += push;
            cost += push * dist[t];
        }
        return {flow, cost};
    }
};`,
  },
  {
    id: "kuhn-matching",
    name: "Bipartite Matching (Kuhn)",
    category: "graph-advanced",
    level: "intermediate",
    complexity: "O(V E)",
    tags: ["matching", "bipartite", "augmenting path"],
    summary:
      "Maximum matching by repeatedly searching for an augmenting path from each left vertex. Short enough to memorise and fast enough for a few thousand vertices.",
    usage: "auto [size, matchR] = kuhn(g, nLeft, nRight);",
    variants:
      "Shuffling the adjacency lists and greedily pre-matching typically cuts the work several-fold.",
    code: String.raw`pair<int, vector<int>> kuhn(const vector<vector<int>> &g, int nL, int nR) {
    vector<int> matchR(nR, -1);
    vector<bool> used;

    function<bool(int)> tryKuhn = [&](int v) {
        for (int u : g[v]) {
            if (used[u]) continue;
            used[u] = true;
            if (matchR[u] == -1 || tryKuhn(matchR[u])) { matchR[u] = v; return true; }
        }
        return false;
    };

    int size = 0;
    for (int v = 0; v < nL; v++) {
        used.assign(nR, false);
        if (tryKuhn(v)) size++;
    }
    return {size, matchR};
}`,
  },
  {
    id: "hopcroft-karp",
    name: "Bipartite Matching (Hopcroft-Karp)",
    category: "graph-advanced",
    level: "advanced",
    complexity: "O(E sqrt V)",
    tags: ["matching", "bipartite", "layered"],
    summary:
      "Augments along many shortest paths per phase instead of one, which is the practical choice when the bipartite graph has 1e5+ vertices.",
    usage: "auto [size, matchL, matchR] = hopcroft_karp(g, nL, nR);",
    code: String.raw`tuple<int, vector<int>, vector<int>> hopcroft_karp(
        const vector<vector<int>> &g, int nL, int nR) {
    const int INF = INT_MAX;
    vector<int> matchL(nL, -1), matchR(nR, -1), dist(nL);
    int size = 0;

    while (true) {
        queue<int> q;
        for (int v = 0; v < nL; v++) {
            if (matchL[v] == -1) { dist[v] = 0; q.push(v); }
            else dist[v] = INF;
        }
        bool found = false;
        while (!q.empty()) {
            int v = q.front(); q.pop();
            for (int u : g[v]) {
                int w = matchR[u];
                if (w == -1) { found = true; continue; }
                if (dist[w] == INF) { dist[w] = dist[v] + 1; q.push(w); }
            }
        }
        if (!found) break;

        function<bool(int)> dfs = [&](int v) -> bool {
            for (int u : g[v]) {
                int w = matchR[u];
                if (w == -1 || (dist[w] == dist[v] + 1 && dfs(w))) {
                    matchL[v] = u;
                    matchR[u] = v;
                    return true;
                }
            }
            dist[v] = INF;
            return false;
        };

        for (int v = 0; v < nL; v++)
            if (matchL[v] == -1 && dfs(v)) size++;
    }
    return {size, matchL, matchR};
}`,
  },
  {
    id: "hungarian",
    name: "Assignment Problem (Hungarian)",
    category: "graph-advanced",
    level: "advanced",
    complexity: "O(n^2 m)",
    tags: ["assignment", "min cost matching"],
    summary:
      "Minimum-cost perfect matching on a complete bipartite cost matrix. Cleaner and faster than min-cost flow for the square assignment case.",
    usage: "auto [cost, assign] = hungarian(a);   // a is 1-indexed n x m, n <= m",
    code: String.raw`// a[1..n][1..m], returns min cost and assignment of rows to columns
pair<long long, vector<int>> hungarian(const vector<vector<long long>> &a) {
    const long long INF = (long long)4e18;
    int n = a.size() - 1, m = a[0].size() - 1;
    vector<long long> u(n + 1, 0), v(m + 1, 0);
    vector<int> p(m + 1, 0), way(m + 1, 0);

    for (int i = 1; i <= n; i++) {
        vector<long long> minv(m + 1, INF);
        vector<bool> used(m + 1, false);
        p[0] = i;
        int j0 = 0;
        do {
            used[j0] = true;
            int i0 = p[j0], j1 = -1;
            long long delta = INF;
            for (int j = 1; j <= m; j++) {
                if (used[j]) continue;
                long long cur = a[i0][j] - u[i0] - v[j];
                if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
                if (minv[j] < delta) { delta = minv[j]; j1 = j; }
            }
            for (int j = 0; j <= m; j++) {
                if (used[j]) { u[p[j]] += delta; v[j] -= delta; }
                else minv[j] -= delta;
            }
            j0 = j1;
        } while (p[j0] != 0);
        do { int j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
    }

    vector<int> assign(n + 1, 0);
    for (int j = 1; j <= m; j++) if (p[j]) assign[p[j]] = j;
    return {-v[0], assign};
}`,
  },
  {
    id: "two-sat",
    name: "2-SAT",
    category: "graph-advanced",
    level: "advanced",
    complexity: "O(V + E)",
    tags: ["2-sat", "scc", "implication graph"],
    summary:
      "Solves a conjunction of two-literal clauses by building the implication graph and reading an assignment off the SCC condensation order.",
    usage: "TwoSat ts(n); ts.addClause(0, true, 1, false); if (ts.solve()) ...",
    variants:
      "Encode 'at most one of these' with auxiliary prefix variables to keep the clause count linear.",
    code: String.raw`struct TwoSat {
    int n;
    vector<vector<int>> g, rg;
    vector<int> comp, order;
    vector<bool> vis, value;

    explicit TwoSat(int n) : n(n), g(2 * n), rg(2 * n) {}

    int lit(int x, bool isTrue) { return 2 * x + (isTrue ? 0 : 1); }

    void addImply(int a, int b) { g[a].push_back(b); rg[b].push_back(a); }

    // (x = xTrue) OR (y = yTrue)
    void addClause(int x, bool xTrue, int y, bool yTrue) {
        int a = lit(x, xTrue), b = lit(y, yTrue);
        addImply(a ^ 1, b);
        addImply(b ^ 1, a);
    }

    void addForced(int x, bool isTrue) { addClause(x, isTrue, x, isTrue); }

    bool solve() {
        int N = 2 * n, cnt = 0;
        vis.assign(N, false);
        comp.assign(N, -1);
        order.clear();
        function<void(int)> dfs1 = [&](int v) {
            vis[v] = true;
            for (int u : g[v]) if (!vis[u]) dfs1(u);
            order.push_back(v);
        };
        function<void(int,int)> dfs2 = [&](int v, int c) {
            comp[v] = c;
            for (int u : rg[v]) if (comp[u] == -1) dfs2(u, c);
        };
        for (int v = 0; v < N; v++) if (!vis[v]) dfs1(v);
        for (int i = N - 1; i >= 0; i--) if (comp[order[i]] == -1) dfs2(order[i], cnt++);

        value.assign(n, false);
        for (int x = 0; x < n; x++) {
            if (comp[2 * x] == comp[2 * x + 1]) return false;
            value[x] = comp[2 * x] < comp[2 * x + 1];
        }
        return true;
    }
};`,
  },
  {
    id: "konig",
    name: "Konig: Vertex Cover & Independent Set",
    category: "graph-advanced",
    level: "advanced",
    complexity: "O(V E) after matching",
    tags: ["matching", "vertex cover", "duality"],
    summary:
      "In a bipartite graph, minimum vertex cover equals maximum matching, and its complement is the maximum independent set. This recovers the actual sets.",
    usage: "auto [coverL, coverR] = min_vertex_cover(g, nL, nR, matchL, matchR);",
    variants:
      "Minimum path cover of a DAG = n - maximum matching in the split bipartite graph.",
    code: String.raw`// needs a maximum matching (matchL/matchR) from Kuhn or Hopcroft-Karp
pair<vector<int>, vector<int>> min_vertex_cover(
        const vector<vector<int>> &g, int nL, int nR,
        const vector<int> &matchL, const vector<int> &matchR) {
    vector<bool> visL(nL, false), visR(nR, false);

    function<void(int)> dfs = [&](int v) {          // alternating walk
        visL[v] = true;
        for (int u : g[v]) {
            if (u == matchL[v] || visR[u]) continue;
            visR[u] = true;
            if (matchR[u] != -1) dfs(matchR[u]);
        }
    };

    for (int v = 0; v < nL; v++) if (matchL[v] == -1) dfs(v);

    vector<int> coverL, coverR;
    for (int v = 0; v < nL; v++) if (!visL[v]) coverL.push_back(v);   // unreachable left
    for (int u = 0; u < nR; u++) if (visR[u]) coverR.push_back(u);    // reachable right
    return {coverL, coverR};
}`,
  },
  {
    id: "project-selection",
    name: "Project Selection / Max Closure",
    category: "graph-advanced",
    level: "advanced",
    complexity: "O(max flow)",
    tags: ["min cut", "modelling", "closure"],
    summary:
      "Maximises profit minus cost when picking an item forces its prerequisites: profits become source edges, costs sink edges, dependencies infinite edges, answer = total profit - min cut.",
    usage: "long long best = project_selection(profit, cost, deps);",
    code: String.raw`// needs the Dinic snippet
// profit[i] >= 0 gain for taking project i, cost[j] >= 0 price of resource j,
// deps[i] = resources project i requires
long long project_selection(const vector<long long> &profit,
                            const vector<long long> &cost,
                            const vector<vector<int>> &deps) {
    int P = profit.size(), R = cost.size();
    int s = P + R, t = s + 1;
    Dinic d(t + 1);
    long long total = 0;
    const long long INF = (long long)4e18;

    for (int i = 0; i < P; i++) { total += profit[i]; d.addEdge(s, i, profit[i]); }
    for (int j = 0; j < R; j++) d.addEdge(P + j, t, cost[j]);
    for (int i = 0; i < P; i++)
        for (int j : deps[i]) d.addEdge(i, P + j, INF);

    return total - d.maxflow(s, t);
}`,
  },
  {
    id: "vertex-capacity",
    name: "Vertex Capacities & Disjoint Paths",
    category: "graph-advanced",
    level: "advanced",
    complexity: "O(max flow)",
    tags: ["modelling", "menger", "min cut"],
    summary:
      "Splitting each vertex into in/out halves joined by its capacity turns vertex limits into edge limits. With capacity 1 the max flow counts vertex-disjoint paths (Menger).",
    usage: "auto [d, in_, out_] = split_vertices(n, capacity);",
    code: String.raw`// needs the Dinic snippet
struct SplitGraph {
    Dinic d;
    int n;
    explicit SplitGraph(int n, const vector<long long> &vertexCap) : d(2 * n), n(n) {
        for (int v = 0; v < n; v++) d.addEdge(in_(v), out_(v), vertexCap[v]);
    }
    int in_(int v) const { return v; }
    int out_(int v) const { return n + v; }
    void addEdge(int a, int b, long long cap) { d.addEdge(out_(a), in_(b), cap); }
    long long maxflow(int s, int t) { return d.maxflow(out_(s), in_(t)); }
};`,
  },
  {
    id: "circulation-lower-bounds",
    name: "Flow with Lower Bounds",
    category: "graph-advanced",
    level: "advanced",
    complexity: "O(max flow)",
    tags: ["circulation", "feasibility", "modelling"],
    summary:
      "Edges that must carry at least L units become a feasibility problem: subtract L from the capacity, record the excess at both endpoints, and saturate a super source/sink.",
    usage: "if (feasible_circulation(edges, n)) ...",
    code: String.raw`// needs the Dinic snippet
struct LowerBound {
    int n, S, T;
    Dinic d;
    vector<long long> excess;
    long long need = 0;

    explicit LowerBound(int n) : n(n), S(n), T(n + 1), d(n + 2), excess(n, 0) {}

    void addEdge(int a, int b, long long lo, long long hi) {
        d.addEdge(a, b, hi - lo);
        excess[b] += lo;
        excess[a] -= lo;
    }

    bool feasible() {
        for (int v = 0; v < n; v++) {
            if (excess[v] > 0) { d.addEdge(S, v, excess[v]); need += excess[v]; }
            else if (excess[v] < 0) d.addEdge(v, T, -excess[v]);
        }
        return d.maxflow(S, T) == need;
    }
};`,
  },
  {
    id: "min-cut-recovery",
    name: "Recovering a Min Cut",
    category: "graph-advanced",
    level: "advanced",
    complexity: "O(V + E) after max flow",
    tags: ["min cut", "max flow", "duality"],
    summary:
      "Max-flow min-cut: after saturating the network, the vertices reachable from the source in the residual graph form one side, and the saturated crossing edges are the cut.",
    usage: "auto cut = min_cut_edges(d, s, edgeList);",
    code: String.raw`// needs the Dinic snippet (minCutSide)
struct RawEdge { int a, b; long long cap; };

vector<RawEdge> min_cut_edges(Dinic &d, int s, const vector<RawEdge> &edges) {
    vector<bool> side = d.minCutSide(s);       // true = source side
    vector<RawEdge> cut;
    for (const auto &e : edges)
        if (side[e.a] && !side[e.b]) cut.push_back(e);
    return cut;
}`,
  },
];

export default algos;
