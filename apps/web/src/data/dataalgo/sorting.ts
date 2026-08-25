import type { Algo } from "./types";

const algos: Algo[] = [
  {
    id: "binary-search",
    name: "Binary Search (lower/upper bound)",
    category: "sorting",
    level: "basic",
    complexity: "O(log n)",
    tags: ["search", "sorted"],
    summary:
      "First index not less than x, and first index greater than x. Writing both by hand kills most off-by-one bugs in counting queries.",
    usage: "int i = lower_bound_(a, x);   // count of x = ub - lb",
    variants:
      "std::lower_bound / upper_bound do this on any sorted range; hand-rolled versions matter when the predicate is not a comparison.",
    code: String.raw`int lower_bound_(const vector<int> &a, int x) {
    int lo = 0, hi = a.size();          // [lo, hi)
    while (lo < hi) {
        int mid = lo + (hi - lo) / 2;
        if (a[mid] < x) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

int upper_bound_(const vector<int> &a, int x) {
    int lo = 0, hi = a.size();
    while (lo < hi) {
        int mid = lo + (hi - lo) / 2;
        if (a[mid] <= x) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}`,
  },
  {
    id: "parametric-search",
    name: "Binary Search on the Answer",
    category: "sorting",
    level: "intermediate",
    complexity: "O(log(range) * check)",
    tags: ["search", "greedy", "predicate"],
    summary:
      "When 'can we do it with budget X' is monotone, binary search over X instead of computing the optimum directly. The workhorse of minimax problems.",
    usage: "long long ans = min_feasible(1, 1e18, [&](long long x){ return check(x); });",
    variants:
      "Mirror it for the largest feasible value; on doubles run a fixed 100 iterations instead of comparing to an epsilon.",
    code: String.raw`// smallest x in [lo, hi] with ok(x) true; hi+1 if none
template <class F>
long long min_feasible(long long lo, long long hi, F ok) {
    long long res = hi + 1;
    while (lo <= hi) {
        long long mid = lo + (hi - lo) / 2;
        if (ok(mid)) { res = mid; hi = mid - 1; }
        else lo = mid + 1;
    }
    return res;
}

// largest x in [lo, hi] with ok(x) true; lo-1 if none
template <class F>
long long max_feasible(long long lo, long long hi, F ok) {
    long long res = lo - 1;
    while (lo <= hi) {
        long long mid = lo + (hi - lo) / 2;
        if (ok(mid)) { res = mid; lo = mid + 1; }
        else hi = mid - 1;
    }
    return res;
}`,
  },
  {
    id: "ternary-search",
    name: "Ternary Search",
    category: "sorting",
    level: "intermediate",
    complexity: "O(log(range))",
    tags: ["search", "unimodal", "optimisation"],
    summary:
      "Finds the extremum of a strictly unimodal function by discarding a third of the interval per step. Integer version returns an exact index.",
    usage: "double x = ternary_max([](double t){ return -(t-3)*(t-3); }, -100, 100);",
    code: String.raw`template <class F>
double ternary_max(F f, double lo, double hi) {
    for (int it = 0; it < 200; it++) {
        double m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
        if (f(m1) < f(m2)) lo = m1; else hi = m2;
    }
    return (lo + hi) / 2;
}

template <class F>
long long ternary_max_int(F f, long long lo, long long hi) {
    while (hi - lo > 2) {
        long long m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
        if (f(m1) < f(m2)) lo = m1 + 1; else hi = m2;
    }
    long long best = lo;
    for (long long i = lo; i <= hi; i++) if (f(i) > f(best)) best = i;
    return best;
}`,
  },
  {
    id: "count-inversions",
    name: "Count Inversions (merge sort)",
    category: "sorting",
    level: "intermediate",
    complexity: "O(n log n)",
    tags: ["divide and conquer", "merge sort"],
    summary:
      "Counts pairs i < j with a[i] > a[j] while sorting. Equals the minimum number of adjacent swaps needed to sort the array.",
    usage: "long long inv = count_inversions(a);",
    variants:
      "A BIT over compressed values gives the same count and extends to 'inversions with weight' or per-element counts.",
    code: String.raw`long long merge_count(vector<int> &a, int l, int r, vector<int> &buf) {
    if (r - l <= 1) return 0;
    int m = (l + r) / 2;
    long long res = merge_count(a, l, m, buf) + merge_count(a, m, r, buf);
    int i = l, j = m, k = l;
    while (i < m && j < r) {
        if (a[i] <= a[j]) buf[k++] = a[i++];
        else { res += m - i; buf[k++] = a[j++]; }
    }
    while (i < m) buf[k++] = a[i++];
    while (j < r) buf[k++] = a[j++];
    for (int t = l; t < r; t++) a[t] = buf[t];
    return res;
}

long long count_inversions(vector<int> a) {
    vector<int> buf(a.size());
    return merge_count(a, 0, a.size(), buf);
}`,
  },
  {
    id: "two-pointers",
    name: "Two Pointers",
    category: "sorting",
    level: "basic",
    complexity: "O(n)",
    tags: ["pattern", "sorted"],
    summary:
      "Walks two indices in one direction so every element is visited a constant number of times. Replaces a nested loop whenever the inner bound is monotone.",
    usage: "int best = longest_sum_at_most(a, k);",
    code: String.raw`// longest subarray with sum <= k (non-negative values)
int longest_sum_at_most(const vector<int> &a, long long k) {
    long long sum = 0;
    int best = 0, l = 0;
    for (int r = 0; r < (int)a.size(); r++) {
        sum += a[r];
        while (sum > k && l <= r) sum -= a[l++];
        best = max(best, r - l + 1);
    }
    return best;
}

// pair with a given sum in a sorted array
pair<int,int> pair_with_sum(const vector<int> &a, int target) {
    int l = 0, r = (int)a.size() - 1;
    while (l < r) {
        int s = a[l] + a[r];
        if (s == target) return {l, r};
        if (s < target) l++; else r--;
    }
    return {-1, -1};
}`,
  },
  {
    id: "sliding-window-min",
    name: "Sliding Window Minimum (monotonic deque)",
    category: "sorting",
    level: "intermediate",
    complexity: "O(n)",
    tags: ["deque", "window", "monotonic"],
    summary:
      "Minimum of every window of length k in linear time by keeping a deque of indices with increasing values. The same shape powers many DP optimisations.",
    usage: "auto mn = window_min(a, k);   // size n-k+1",
    variants:
      "Flip the comparison for maximum; keep (value, index) pairs to also answer 'where'.",
    code: String.raw`vector<int> window_min(const vector<int> &a, int k) {
    deque<int> dq;                      // indices, values increasing
    vector<int> res;
    for (int i = 0; i < (int)a.size(); i++) {
        while (!dq.empty() && a[dq.back()] >= a[i]) dq.pop_back();
        dq.push_back(i);
        if (dq.front() <= i - k) dq.pop_front();
        if (i >= k - 1) res.push_back(a[dq.front()]);
    }
    return res;
}`,
  },
  {
    id: "monotonic-stack",
    name: "Monotonic Stack (previous/next smaller)",
    category: "sorting",
    level: "intermediate",
    complexity: "O(n)",
    tags: ["stack", "monotonic"],
    summary:
      "Nearest smaller element on each side for every index. Backbone of largest-rectangle, sum-of-subarray-minimums and many DP transitions.",
    usage: "auto [L, R] = prev_next_smaller(a);",
    variants:
      "Use >= instead of > on one side to break ties consistently when summing over subarrays.",
    code: String.raw`// L[i] = index of previous strictly smaller, -1 if none
// R[i] = index of next smaller or equal, n if none
pair<vector<int>, vector<int>> prev_next_smaller(const vector<int> &a) {
    int n = a.size();
    vector<int> L(n, -1), R(n, n);
    vector<int> st;
    for (int i = 0; i < n; i++) {
        while (!st.empty() && a[st.back()] >= a[i]) st.pop_back();
        L[i] = st.empty() ? -1 : st.back();
        st.push_back(i);
    }
    st.clear();
    for (int i = n - 1; i >= 0; i--) {
        while (!st.empty() && a[st.back()] > a[i]) st.pop_back();
        R[i] = st.empty() ? n : st.back();
        st.push_back(i);
    }
    return {L, R};
}

long long largest_rectangle(const vector<int> &h) {
    auto [L, R] = prev_next_smaller(h);
    long long best = 0;
    for (int i = 0; i < (int)h.size(); i++)
        best = max(best, (long long)h[i] * (R[i] - L[i] - 1));
    return best;
}`,
  },
  {
    id: "coordinate-compression",
    name: "Coordinate Compression",
    category: "sorting",
    level: "basic",
    complexity: "O(n log n)",
    tags: ["preprocessing", "indexing"],
    summary:
      "Maps arbitrary values to 0..m-1 preserving order, so BITs and segment trees can be sized by distinct-value count instead of value range.",
    usage: "auto vals = compress(a);   // a now holds ranks",
    code: String.raw`vector<long long> compress(vector<long long> &a) {
    vector<long long> vals = a;
    sort(vals.begin(), vals.end());
    vals.erase(unique(vals.begin(), vals.end()), vals.end());
    for (auto &x : a)
        x = lower_bound(vals.begin(), vals.end(), x) - vals.begin();
    return vals;                        // vals[rank] = original value
}`,
  },
  {
    id: "quickselect",
    name: "K-th Order Statistic (quickselect)",
    category: "sorting",
    level: "intermediate",
    complexity: "O(n) expected",
    tags: ["selection", "partition"],
    summary:
      "Finds the k-th smallest element without sorting, by partitioning only the side that contains k.",
    usage: "int kth = kth_element(a, k);   // 0-indexed",
    variants:
      "std::nth_element is the library version and is usually faster; keep this when you need the partition boundaries.",
    code: String.raw`int kth_element(vector<int> a, int k) {
    nth_element(a.begin(), a.begin() + k, a.end());
    return a[k];
}

// explicit version: partition around a random pivot
int quickselect(vector<int> &a, int l, int r, int k) {
    if (l == r) return a[l];
    static mt19937 rng(12345);
    int pivot = a[l + rng() % (r - l + 1)];
    int i = l, j = r;
    while (i <= j) {
        while (a[i] < pivot) i++;
        while (a[j] > pivot) j--;
        if (i <= j) swap(a[i++], a[j--]);
    }
    if (k <= j) return quickselect(a, l, j, k);
    if (k >= i) return quickselect(a, i, r, k);
    return a[k];
}`,
  },
  {
    id: "counting-radix-sort",
    name: "Counting & Radix Sort",
    category: "sorting",
    level: "intermediate",
    complexity: "O(n + range) / O(n * digits)",
    tags: ["linear sort", "stable"],
    summary:
      "Sorts small-range integers in linear time. Radix sort chains stable counting passes and is the standard inner loop of suffix array construction.",
    usage: "counting_sort(a, 1000000);",
    code: String.raw`void counting_sort(vector<int> &a, int maxv) {
    vector<int> cnt(maxv + 1, 0);
    for (int x : a) cnt[x]++;
    int idx = 0;
    for (int v = 0; v <= maxv; v++)
        while (cnt[v]--) a[idx++] = v;
}

void radix_sort(vector<unsigned int> &a) {
    vector<unsigned int> buf(a.size());
    for (int shift = 0; shift < 32; shift += 8) {
        int cnt[256] = {0};
        for (unsigned int x : a) cnt[(x >> shift) & 255]++;
        int sum = 0;
        for (int i = 0; i < 256; i++) { int c = cnt[i]; cnt[i] = sum; sum += c; }
        for (unsigned int x : a) buf[cnt[(x >> shift) & 255]++] = x;
        a.swap(buf);
    }
}`,
  },
  {
    id: "merge-k-sorted",
    name: "Merge K Sorted Lists",
    category: "sorting",
    level: "basic",
    complexity: "O(n log k)",
    tags: ["heap", "merge"],
    summary:
      "Merges k sorted sequences with a min-heap holding one candidate per list. Also the shape of 'k smallest sums' problems.",
    usage: "auto merged = merge_k(lists);",
    code: String.raw`vector<int> merge_k(const vector<vector<int>> &lists) {
    using Item = tuple<int,int,int>;    // value, list, index
    priority_queue<Item, vector<Item>, greater<Item>> pq;
    for (int i = 0; i < (int)lists.size(); i++)
        if (!lists[i].empty()) pq.push({lists[i][0], i, 0});

    vector<int> res;
    while (!pq.empty()) {
        auto [v, li, idx] = pq.top(); pq.pop();
        res.push_back(v);
        if (idx + 1 < (int)lists[li].size()) pq.push({lists[li][idx + 1], li, idx + 1});
    }
    return res;
}`,
  },
  {
    id: "next-permutation",
    name: "Next Lexicographic Permutation",
    category: "sorting",
    level: "basic",
    complexity: "O(n) per step",
    tags: ["permutation", "enumeration"],
    summary:
      "Steps to the next permutation in lexicographic order in place: find the rightmost ascent, swap with its successor, reverse the tail.",
    usage: "do { ... } while (next_perm(a));",
    variants:
      "std::next_permutation is identical; enumerate all n! orders by sorting first and looping until it returns false.",
    code: String.raw`bool next_perm(vector<int> &a) {
    int n = a.size(), i = n - 2;
    while (i >= 0 && a[i] >= a[i + 1]) i--;
    if (i < 0) { reverse(a.begin(), a.end()); return false; }
    int j = n - 1;
    while (a[j] <= a[i]) j--;
    swap(a[i], a[j]);
    reverse(a.begin() + i + 1, a.end());
    return true;
}`,
  },
];

export default algos;
