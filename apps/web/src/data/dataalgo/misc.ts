import type { Algo } from "./types";

const algos: Algo[] = [
  {
    id: "fast-io",
    name: "Fast Input / Output",
    category: "misc",
    level: "basic",
    complexity: "O(1) per token",
    tags: ["io", "performance"],
    summary:
      "Untying cin from cout is usually enough; the getchar reader is for the 1e6-plus-numbers cases where iostream still dominates the runtime.",
    usage: "fast_io();   // or int x = readInt();",
    variants:
      "Never mix the custom reader with cin on the same stream. For interactive problems keep endl (it flushes) or call cout.flush() explicitly.",
    code: String.raw`void fast_io() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
}

// hand-rolled reader for very large inputs
static inline int readInt() {
    int c = getchar_unlocked(), sign = 1, x = 0;
    while (c != '-' && (c < '0' || c > '9')) c = getchar_unlocked();
    if (c == '-') { sign = -1; c = getchar_unlocked(); }
    while (c >= '0' && c <= '9') { x = x * 10 + (c - '0'); c = getchar_unlocked(); }
    return x * sign;
}`,
  },
  {
    id: "mint",
    name: "Modular Integer Struct",
    category: "misc",
    level: "intermediate",
    complexity: "O(1) per op",
    tags: ["modular", "struct", "operators"],
    summary:
      "Wraps modular arithmetic in a type so DP code reads like plain arithmetic and no reduction is ever forgotten.",
    usage: "Mint a = 3; a = a.pow(10) + 5; cout << a.v;",
    code: String.raw`struct Mint {
    static const long long MOD = 1000000007;
    long long v;

    Mint(long long x = 0) { v = ((x % MOD) + MOD) % MOD; }

    Mint operator+(const Mint &o) const { return Mint(v + o.v); }
    Mint operator-(const Mint &o) const { return Mint(v - o.v); }
    Mint operator*(const Mint &o) const { return Mint(v * o.v % MOD); }

    Mint pow(long long e) const {
        Mint r(1), b(v);
        while (e > 0) { if (e & 1) r = r * b; b = b * b; e >>= 1; }
        return r;
    }

    Mint inv() const { return pow(MOD - 2); }               // MOD must be prime
    Mint operator/(const Mint &o) const { return *this * o.inv(); }
};`,
  },
  {
    id: "bit-tricks",
    name: "Bit Manipulation Toolkit",
    category: "misc",
    level: "basic",
    complexity: "O(1)",
    tags: ["bitmask", "popcount", "gray code"],
    summary:
      "Popcount, lowest set bit, submask enumeration and Gray code. These four cover almost every bitmask manipulation a contest needs.",
    usage: "int bits = __builtin_popcount(mask);",
    variants:
      "Use the ll variants (__builtin_popcountll, __builtin_ctzll) for 64-bit masks; both are undefined for zero.",
    code: String.raw`// counts / indices
int bits = __builtin_popcount(mask);          // set bits
int lowestIdx = __builtin_ctz(mask);          // index of lowest set bit (mask != 0)
int highestIdx = 31 - __builtin_clz(mask);    // index of highest set bit (mask != 0)
int lowbit = mask & -mask;                    // lowest set bit as a value

// set operations
bool has = (mask >> i) & 1;
int withI = mask | (1 << i);
int withoutI = mask & ~(1 << i);
int toggled = mask ^ (1 << i);
bool isPow2 = mask && !(mask & (mask - 1));

// enumerate every submask of mask, descending
// for (int s = mask; ; s = (s - 1) & mask) { use(s); if (!s) break; }

// Gray code: consecutive values differ in exactly one bit
int gray(int n) { return n ^ (n >> 1); }
int ungray(int g) { for (int b = 1; b < 32; b <<= 1) g ^= g >> b; return g; }`,
  },
  {
    id: "custom-hash",
    name: "Randomised Hash for unordered_map",
    category: "misc",
    level: "intermediate",
    complexity: "O(1) expected",
    tags: ["hashing", "anti-hash", "performance"],
    summary:
      "Codeforces hacks routinely blow up std::unordered_map by feeding it colliding keys. A per-run random splitmix seed removes that attack surface.",
    usage: "unordered_map<long long, int, CustomHash> mp;",
    variants:
      "Reserving capacity and setting max_load_factor(0.25) gives another large speedup.",
    code: String.raw`struct CustomHash {
    static uint64_t splitmix64(uint64_t x) {
        x += 0x9e3779b97f4a7c15ULL;
        x = (x ^ (x >> 30)) * 0xbf58476d1ce4e5b9ULL;
        x = (x ^ (x >> 27)) * 0x94d049bb133111ebULL;
        return x ^ (x >> 31);
    }

    size_t operator()(uint64_t x) const {
        static const uint64_t FIXED =
            chrono::steady_clock::now().time_since_epoch().count();
        return splitmix64(x + FIXED);
    }
};

// unordered_map<long long, int, CustomHash> mp;
// mp.reserve(1 << 20);
// mp.max_load_factor(0.25);`,
  },
  {
    id: "meet-in-the-middle",
    name: "Meet in the Middle",
    category: "misc",
    level: "advanced",
    complexity: "O(2^(n/2) log)",
    tags: ["brute force", "subset", "two halves"],
    summary:
      "Splits the input in half, enumerates each half fully, then pairs the halves with sorting or hashing. Turns 2^40 into a manageable 2^20 twice.",
    usage: "long long best = mitm(a, target);",
    variants:
      "Bidirectional BFS is the graph version of the same idea, and it halves the search depth.",
    code: String.raw`// largest subset sum not exceeding target
long long mitm(const vector<long long> &a, long long target) {
    int n = a.size(), h = n / 2;
    auto gen = [&](int from, int to) {
        vector<long long> sums{0};
        for (int i = from; i < to; i++) {
            vector<long long> nxt = sums;
            for (long long s : sums) nxt.push_back(s + a[i]);
            sums.swap(nxt);
        }
        return sums;
    };

    vector<long long> A = gen(0, h), B = gen(h, n);
    sort(B.begin(), B.end());
    long long best = 0;
    for (long long s : A) {
        if (s > target) continue;
        auto it = upper_bound(B.begin(), B.end(), target - s);
        if (it != B.begin()) best = max(best, s + *prev(it));
    }
    return best;
}`,
  },
  {
    id: "sprague-grundy",
    name: "Sprague-Grundy (Nim values)",
    category: "misc",
    level: "advanced",
    complexity: "O(states * moves)",
    tags: ["game theory", "nim", "grundy"],
    summary:
      "Every impartial game position gets a Grundy value: the mex of its successors. Independent games XOR together, so a position is losing exactly when the XOR is zero.",
    usage: "auto g = grundy_table(n); bool win = (g[a] ^ g[b] ^ g[c]) != 0;",
    variants:
      "Plain Nim: Grundy of a pile of k is k, so the XOR of pile sizes decides the winner.",
    code: String.raw`vector<int> grundy_table(int n, const vector<int> &moves) {
    vector<int> g(n + 1, 0);
    for (int s = 1; s <= n; s++) {
        set<int> reachable;
        for (int m : moves) if (s - m >= 0) reachable.insert(g[s - m]);
        int mex = 0;
        while (reachable.count(mex)) mex++;
        g[s] = mex;
    }
    return g;
}`,
  },
  {
    id: "game-dp",
    name: "Win/Lose State DP",
    category: "misc",
    level: "intermediate",
    complexity: "O(states * moves)",
    tags: ["game theory", "dp", "minimax"],
    summary:
      "A position is winning if any move leads to a losing position. Memoise over the state and the recursion writes itself; add scores for minimax variants.",
    usage: "bool firstPlayerWins = win(n);",
    code: String.raw`vector<int> memo_;                              // -1 unknown, 0 lose, 1 win

bool win(int state, const vector<int> &moves) {
    if (memo_[state] != -1) return memo_[state];
    memo_[state] = 0;
    for (int m : moves)
        if (state - m >= 0 && !win(state - m, moves)) { memo_[state] = 1; break; }
    return memo_[state];
}

// minimax with scores: value(state) = max over moves of (gain - value(next))
long long best_score(int state, const vector<long long> &gain, vector<long long> &dp) {
    if (state == 0) return 0;
    if (dp[state] != LLONG_MIN) return dp[state];
    long long best = LLONG_MIN;
    for (int take = 1; take <= 3 && take <= state; take++)
        best = max(best, gain[state - take] - best_score(state - take, gain, dp));
    return dp[state] = best;
}`,
  },
  {
    id: "inclusion-exclusion",
    name: "Inclusion-Exclusion",
    category: "misc",
    level: "intermediate",
    complexity: "O(2^k) or O(divisors)",
    tags: ["counting", "inclusion-exclusion", "bitmask"],
    summary:
      "Counts a union by adding singles, subtracting pairs, adding triples, and so on. With small k it is a bitmask loop; over divisors it becomes Mobius.",
    usage: "long long bad = count_divisible_by_any(n, primes);",
    code: String.raw`// how many integers in [1, n] are divisible by at least one of the given values
long long count_divisible_by_any(long long n, const vector<long long> &d) {
    int k = d.size();
    long long total = 0;
    for (int mask = 1; mask < (1 << k); mask++) {
        long long lcm = 1;
        bool overflow = false;
        for (int i = 0; i < k && !overflow; i++) {
            if (!((mask >> i) & 1)) continue;
            lcm = lcm / __gcd(lcm, d[i]) * d[i];
            if (lcm > n) overflow = true;
        }
        if (overflow) continue;
        long long term = n / lcm;
        total += (__builtin_popcount(mask) & 1) ? term : -term;
    }
    return total;
}`,
  },
  {
    id: "interval-scheduling",
    name: "Interval Scheduling & Sweep",
    category: "misc",
    level: "basic",
    complexity: "O(n log n)",
    tags: ["greedy", "sweep line", "intervals"],
    summary:
      "Picking the earliest finishing interval each time is optimal for 'maximum non-overlapping intervals'. The event sweep answers maximum simultaneous overlap.",
    usage: "int k = max_non_overlapping(iv); int peak = max_overlap(iv);",
    variants:
      "Minimum number of rooms equals the peak overlap; weighted interval scheduling needs DP with binary search instead of greed.",
    code: String.raw`int max_non_overlapping(vector<pair<int,int>> iv) {      // (start, end)
    sort(iv.begin(), iv.end(), [](auto &a, auto &b) { return a.second < b.second; });
    int count = 0, lastEnd = INT_MIN;
    for (auto [s, e] : iv)
        if (s >= lastEnd) { count++; lastEnd = e; }
    return count;
}

int max_overlap(const vector<pair<int,int>> &iv) {
    vector<pair<int,int>> ev;                            // (position, +1/-1)
    for (auto [s, e] : iv) { ev.push_back({s, 1}); ev.push_back({e, -1}); }
    sort(ev.begin(), ev.end());                          // ends before starts at a tie
    int cur = 0, best = 0;
    for (auto [pos, delta] : ev) { cur += delta; best = max(best, cur); }
    return best;
}`,
  },
  {
    id: "floyd-cycle",
    name: "Cycle Detection (tortoise and hare)",
    category: "misc",
    level: "intermediate",
    complexity: "O(mu + lambda) time, O(1) memory",
    tags: ["cycle", "functional graph", "pointers"],
    summary:
      "Finds the start and length of a cycle in an iterated function using two pointers at different speeds, with no visited array at all.",
    usage: "auto [start, len] = floyd_cycle(f, x0);",
    code: String.raw`template <class F>
pair<long long,long long> floyd_cycle(F f, long long x0) {
    long long tortoise = f(x0), hare = f(f(x0));
    while (tortoise != hare) { tortoise = f(tortoise); hare = f(f(hare)); }

    long long mu = 0;                                    // index where the cycle starts
    tortoise = x0;
    while (tortoise != hare) { tortoise = f(tortoise); hare = f(hare); mu++; }

    long long lambda = 1;                                // cycle length
    hare = f(tortoise);
    while (tortoise != hare) { hare = f(hare); lambda++; }
    return {mu, lambda};
}`,
  },
  {
    id: "bitset-reachability",
    name: "Bitset Reachability & DP",
    category: "misc",
    level: "advanced",
    complexity: "O(V E / 64)",
    tags: ["bitset", "closure", "optimisation"],
    summary:
      "Storing a reachability row as a bitset lets one OR handle 64 vertices at once, which makes transitive closure on a few thousand vertices practical.",
    usage: "auto reach = transitive_closure(g);",
    variants:
      "The same trick speeds up subset-sum DP, LCS bit-parallel matching and any boolean DP row.",
    code: String.raw`const int MAXN = 2000;

vector<bitset<MAXN>> transitive_closure(const vector<vector<int>> &g) {
    int n = g.size();
    vector<bitset<MAXN>> reach(n);
    vector<int> order, comp;
    vector<bool> vis(n, false);

    function<void(int)> dfs = [&](int v) {
        vis[v] = true;
        for (int u : g[v]) if (!vis[u]) dfs(u);
        order.push_back(v);                              // reverse topological
    };
    for (int v = 0; v < n; v++) if (!vis[v]) dfs(v);

    for (int v : order) {
        reach[v][v] = 1;
        for (int u : g[v]) reach[v] |= reach[u];         // children already done
    }
    return reach;
}`,
  },
  {
    id: "stress-test",
    name: "Stress Testing Harness",
    category: "misc",
    level: "intermediate",
    complexity: "n/a",
    tags: ["debugging", "testing", "brute force"],
    summary:
      "Generates random small cases and compares the fast solution against a brute force until they disagree. The fastest way to find the counterexample a WA is hiding.",
    usage: "bash stress.sh   # stops and prints the first failing input",
    variants:
      "Shrink the failing case afterwards by re-running with smaller bounds; keep the generator seeded by the loop counter so failures reproduce.",
    code: String.raw`// gen.cpp — random test generator, seeded from argv[1]
// int main(int argc, char **argv) {
//     srand(atoi(argv[1]));
//     int n = rand() % 8 + 1;
//     printf("%d\n", n);
//     for (int i = 0; i < n; i++) printf("%d ", rand() % 10);
// }

// stress.sh
// for i in $(seq 1 1000); do
//   ./gen $i > in.txt
//   ./fast < in.txt > out_fast.txt
//   ./brute < in.txt > out_brute.txt
//   if ! diff -q out_fast.txt out_brute.txt > /dev/null; then
//     echo "FAIL on test $i"; cat in.txt; break
//   fi
// done`,
  },
  {
    id: "grid-directions",
    name: "Grid Traversal Helpers",
    category: "misc",
    level: "basic",
    complexity: "O(1)",
    tags: ["grid", "directions", "boilerplate"],
    summary:
      "Direction arrays, a bounds check and index flattening. Small, but it is where most off-by-one grid bugs come from.",
    usage: "for (int d = 0; d < 4; d++) { int nx = x + dx[d], ny = y + dy[d]; ... }",
    variants:
      "Use the 8-direction arrays for king moves, and the knight offsets for chess problems.",
    code: String.raw`const int dx4[] = {1, -1, 0, 0};
const int dy4[] = {0, 0, 1, -1};
const int dx8[] = {1, 1, 1, 0, 0, -1, -1, -1};
const int dy8[] = {1, 0, -1, 1, -1, 1, 0, -1};
const int dxK[] = {2, 2, -2, -2, 1, 1, -1, -1};      // knight
const int dyK[] = {1, -1, 1, -1, 2, -2, 2, -2};

int n_, m_;
bool inside(int x, int y) { return x >= 0 && x < n_ && y >= 0 && y < m_; }
int flat(int x, int y) { return x * m_ + y; }        // 2D -> 1D for DSU / dist arrays

// rotate a grid 90 degrees clockwise
vector<string> rotate90(const vector<string> &g) {
    int n = g.size(), m = g[0].size();
    vector<string> r(m, string(n, ' '));
    for (int i = 0; i < n; i++)
        for (int j = 0; j < m; j++) r[j][n - 1 - i] = g[i][j];
    return r;
}`,
  },
  {
    id: "bigint",
    name: "Big Integer (string arithmetic)",
    category: "misc",
    level: "intermediate",
    complexity: "O(n) add, O(n m) multiply",
    tags: ["bignum", "strings", "arithmetic"],
    summary:
      "Addition and multiplication on decimal digit strings, for the rare problem where __int128 is still not enough and Python is not an option.",
    usage: "string s = big_mul(big_add(a, b), c);",
    variants:
      "For huge multiplications, chunk into base 1e9 limbs and use FFT — plain long multiplication is fine up to a few thousand digits.",
    code: String.raw`string big_add(const string &a, const string &b) {
    string res;
    int carry = 0, i = a.size() - 1, j = b.size() - 1;
    while (i >= 0 || j >= 0 || carry) {
        int s = carry;
        if (i >= 0) s += a[i--] - '0';
        if (j >= 0) s += b[j--] - '0';
        res += char('0' + s % 10);
        carry = s / 10;
    }
    reverse(res.begin(), res.end());
    return res;
}

string big_mul(const string &a, const string &b) {
    if (a == "0" || b == "0") return "0";
    vector<int> tmp(a.size() + b.size(), 0);
    for (int i = a.size() - 1; i >= 0; i--)
        for (int j = b.size() - 1; j >= 0; j--)
            tmp[i + j + 1] += (a[i] - '0') * (b[j] - '0');
    for (int k = tmp.size() - 1; k > 0; k--) {
        tmp[k - 1] += tmp[k] / 10;
        tmp[k] %= 10;
    }
    string res;
    for (size_t k = (tmp[0] == 0 ? 1 : 0); k < tmp.size(); k++) res += char('0' + tmp[k]);
    return res;
}`,
  },
  {
    id: "simulated-annealing",
    name: "Simulated Annealing / Random Restarts",
    category: "misc",
    level: "advanced",
    complexity: "time-bounded",
    tags: ["heuristic", "optimisation", "randomised"],
    summary:
      "For NP-hard optimisation with a scored state, accept worsening moves with a temperature-decaying probability. Bound it by the clock, not by iterations.",
    usage: "auto best = anneal(initial, 0.9);   // stops near the time limit",
    variants:
      "Hill climbing with random restarts is simpler and often as good; always keep the best state seen, not the final one.",
    code: String.raw`template <class State, class Score, class Neighbour>
State anneal(State cur, Score score, Neighbour neighbour, double seconds) {
    static mt19937_64 rng(chrono::steady_clock::now().time_since_epoch().count());
    uniform_real_distribution<double> unit(0.0, 1.0);
    auto start = chrono::steady_clock::now();

    State best = cur;
    double curScore = score(cur), bestScore = curScore;
    while (true) {
        double elapsed = chrono::duration<double>(chrono::steady_clock::now() - start).count();
        if (elapsed > seconds) break;
        double temp = 1.0 - elapsed / seconds;             // 1 -> 0

        State cand = neighbour(cur, rng);
        double candScore = score(cand);
        double delta = candScore - curScore;               // maximising
        if (delta > 0 || unit(rng) < exp(delta / max(1e-9, temp))) {
            cur = cand;
            curScore = candScore;
            if (curScore > bestScore) { bestScore = curScore; best = cur; }
        }
    }
    return best;
}`,
  },
  {
    id: "ternary-int-search",
    name: "Discrete Convex Minimisation",
    category: "misc",
    level: "intermediate",
    complexity: "O(log n) queries",
    tags: ["search", "convex", "sqrt"],
    summary:
      "For an integer convex function, binary search the first index where the forward difference turns non-negative. More robust than ternary search on integers.",
    usage: "long long x = argmin_convex(1, 1000000000, f);",
    code: String.raw`// f convex: differences f(x+1) - f(x) are non-decreasing
template <class F>
long long argmin_convex(long long lo, long long hi, F f) {
    while (lo < hi) {
        long long mid = lo + (hi - lo) / 2;
        if (f(mid) <= f(mid + 1)) hi = mid;
        else lo = mid + 1;
    }
    return lo;
}`,
  },
];

export default algos;
