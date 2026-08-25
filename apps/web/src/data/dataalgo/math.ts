import type { Algo } from "./types";

const algos: Algo[] = [
  {
    id: "gcd-lcm",
    name: "GCD & LCM (Euclid)",
    category: "math",
    level: "basic",
    complexity: "O(log min(a,b))",
    tags: ["number theory", "euclid"],
    summary:
      "Greatest common divisor by repeated remainder, LCM derived from it. Building block for fractions, periodicity and Diophantine problems.",
    usage: "long long g = gcd_(a, b), l = lcm_(a, b);",
    variants:
      "C++17 ships std::gcd / std::lcm in <numeric>; roll your own only for the iterative form or __int128 safety.",
    code: String.raw`long long gcd_(long long a, long long b) {
    while (b) { a %= b; swap(a, b); }
    return a < 0 ? -a : a;
}

long long lcm_(long long a, long long b) {
    if (a == 0 || b == 0) return 0;
    return a / gcd_(a, b) * b;   // divide first: avoids overflow
}`,
  },
  {
    id: "binpow",
    name: "Binary Exponentiation",
    category: "math",
    level: "basic",
    complexity: "O(log e)",
    tags: ["modular", "power"],
    summary:
      "Computes a^e mod m by squaring. Needed for modular inverse via Fermat, matrix powers and hashing.",
    usage: "long long x = binpow(3, 1e18, 1e9 + 7);",
    variants: "Swap the multiply for a matrix product to get matrix power.",
    code: String.raw`long long binpow(long long a, long long e, long long m) {
    long long r = 1 % m;
    a %= m;
    if (a < 0) a += m;
    while (e > 0) {
        if (e & 1) r = (__int128)r * a % m;
        a = (__int128)a * a % m;
        e >>= 1;
    }
    return r;
}`,
  },
  {
    id: "modinv",
    name: "Modular Inverse",
    category: "math",
    level: "basic",
    complexity: "O(log m), O(n) batched",
    tags: ["modular", "fermat"],
    summary:
      "Inverse of a mod m. Fermat for prime moduli, extended Euclid for any modulus coprime to a, prefix trick for 1..n at once.",
    usage: "long long inv = inv_prime(a, 1e9 + 7);",
    code: String.raw`long long binpow(long long a, long long e, long long m) {
    long long r = 1 % m; a %= m; if (a < 0) a += m;
    while (e) { if (e & 1) r = (__int128)r * a % m; a = (__int128)a * a % m; e >>= 1; }
    return r;
}

long long inv_prime(long long a, long long m) { return binpow(a, m - 2, m); }   // m prime

long long inv_gcd(long long a, long long m) {   // any m with gcd(a,m)=1
    long long g = m, x = 0, x1 = 1, a1 = a % m;
    while (a1) {
        long long q = g / a1;
        tie(g, a1) = make_pair(a1, g - q * a1);
        tie(x, x1) = make_pair(x1, x - q * x1);
    }
    return (x % m + m) % m;
}

vector<long long> inv_batch(int n, long long m) {   // inverses of 1..n
    vector<long long> inv(n + 1, 1);
    for (int i = 2; i <= n; i++) inv[i] = (m - (m / i) * inv[m % i] % m) % m;
    return inv;
}`,
  },
  {
    id: "extgcd",
    name: "Extended Euclid & Linear Diophantine",
    category: "math",
    level: "intermediate",
    complexity: "O(log min(a,b))",
    tags: ["number theory", "diophantine"],
    summary:
      "Finds x, y with a*x + b*y = gcd(a,b), then any solution of a*x + b*y = c.",
    usage: "long long x, y, g = extgcd(a, b, x, y);",
    variants:
      "All solutions are x + k*(b/g), y - k*(a/g); pick k to satisfy range constraints.",
    code: String.raw`long long extgcd(long long a, long long b, long long &x, long long &y) {
    if (!b) { x = 1; y = 0; return a; }
    long long x1, y1;
    long long g = extgcd(b, a % b, x1, y1);
    x = y1;
    y = x1 - (a / b) * y1;
    return g;
}

bool diophantine(long long a, long long b, long long c,
                 long long &x, long long &y, long long &g) {
    g = extgcd(a < 0 ? -a : a, b < 0 ? -b : b, x, y);
    if (g == 0) return c == 0;
    if (c % g) return false;
    x *= c / g; y *= c / g;
    if (a < 0) x = -x;
    if (b < 0) y = -y;
    return true;
}`,
  },
  {
    id: "sieve",
    name: "Sieve of Eratosthenes",
    category: "math",
    level: "basic",
    complexity: "O(n log log n)",
    tags: ["primes", "precompute"],
    summary:
      "Marks composites to list every prime up to n. Default choice while n fits in memory.",
    usage: "auto pr = sieve(1000000);",
    code: String.raw`vector<int> sieve(int n) {
    vector<bool> comp(n + 1, false);
    vector<int> primes;
    for (int i = 2; i <= n; i++) {
        if (comp[i]) continue;
        primes.push_back(i);
        for (long long j = (long long)i * i; j <= n; j += i) comp[j] = true;
    }
    return primes;
}`,
  },
  {
    id: "linear-sieve",
    name: "Linear Sieve (smallest prime factor)",
    category: "math",
    level: "intermediate",
    complexity: "O(n)",
    tags: ["primes", "spf", "multiplicative"],
    summary:
      "Visits each composite once, producing primes plus a smallest-prime-factor table that turns factorisation into O(log n) lookups.",
    usage: "auto [primes, spf] = linear_sieve(10000000);",
    variants:
      "The same loop shape computes any multiplicative function (phi, mu, divisor count) in O(n).",
    code: String.raw`pair<vector<int>, vector<int>> linear_sieve(int n) {
    vector<int> spf(n + 1, 0), primes;
    for (int i = 2; i <= n; i++) {
        if (spf[i] == 0) { spf[i] = i; primes.push_back(i); }
        for (int p : primes) {
            if (p > spf[i] || (long long)p * i > n) break;
            spf[p * i] = p;
        }
    }
    return {primes, spf};
}

vector<pair<int,int>> factor_spf(int x, const vector<int> &spf) {
    vector<pair<int,int>> f;
    while (x > 1) {
        int p = spf[x], c = 0;
        while (x % p == 0) { x /= p; c++; }
        f.push_back({p, c});
    }
    return f;
}`,
  },
  {
    id: "segmented-sieve",
    name: "Segmented Sieve",
    category: "math",
    level: "intermediate",
    complexity: "O((R-L) log log R + sqrt R)",
    tags: ["primes", "range"],
    summary:
      "Lists primes in [L, R] when R is too large to sieve but the window is small.",
    usage: "auto pr = segmented_sieve(1000000000000LL, 1000000001000LL);",
    code: String.raw`vector<long long> segmented_sieve(long long L, long long R) {
    long long lim = (long long)sqrtl((long double)R) + 1;
    vector<bool> comp(lim + 1, false);
    vector<long long> base;
    for (long long i = 2; i <= lim; i++) {
        if (comp[i]) continue;
        base.push_back(i);
        for (long long j = i * i; j <= lim; j += i) comp[j] = true;
    }
    vector<bool> mark(R - L + 1, false);
    for (long long p : base) {
        long long start = max(p * p, (L + p - 1) / p * p);
        for (long long j = start; j <= R; j += p) mark[j - L] = true;
    }
    vector<long long> res;
    for (long long i = max(L, 2LL); i <= R; i++) if (!mark[i - L]) res.push_back(i);
    return res;
}`,
  },
  {
    id: "factorize-trial",
    name: "Trial Division Factorisation",
    category: "math",
    level: "basic",
    complexity: "O(sqrt n)",
    tags: ["factorisation"],
    summary:
      "Divides by every candidate up to sqrt(n). Fine up to ~1e12; beyond that use SPF or Pollard's rho.",
    usage: "for (auto [p, e] : factorize(n)) ...",
    code: String.raw`vector<pair<long long,int>> factorize(long long n) {
    vector<pair<long long,int>> f;
    for (long long p = 2; p * p <= n; p++) {
        if (n % p) continue;
        int c = 0;
        while (n % p == 0) { n /= p; c++; }
        f.push_back({p, c});
    }
    if (n > 1) f.push_back({n, 1});
    return f;
}`,
  },
  {
    id: "euler-phi",
    name: "Euler's Totient",
    category: "math",
    level: "intermediate",
    complexity: "O(sqrt n) single, O(n log log n) table",
    tags: ["number theory", "multiplicative"],
    summary:
      "Counts integers in [1,n] coprime to n. Needed for Euler's theorem, coprime-pair counting and multiplicative order arguments.",
    usage: "long long p = phi(n);   // or phi_table(1000000)",
    code: String.raw`long long phi(long long n) {
    long long res = n;
    for (long long p = 2; p * p <= n; p++) {
        if (n % p) continue;
        while (n % p == 0) n /= p;
        res -= res / p;
    }
    if (n > 1) res -= res / n;
    return res;
}

vector<int> phi_table(int n) {
    vector<int> f(n + 1);
    for (int i = 0; i <= n; i++) f[i] = i;
    for (int i = 2; i <= n; i++)
        if (f[i] == i)
            for (int j = i; j <= n; j += i) f[j] -= f[j] / i;
    return f;
}`,
  },
  {
    id: "divisors",
    name: "Divisors & Divisor Sieve",
    category: "math",
    level: "basic",
    complexity: "O(sqrt n) single, O(n log n) table",
    tags: ["divisors", "precompute"],
    summary:
      "Enumerates divisors of one number by pairing d with n/d, or tabulates divisor counts for every value up to n.",
    usage: "auto d = divisors(n);   // sorted",
    code: String.raw`vector<long long> divisors(long long n) {
    vector<long long> d;
    for (long long i = 1; i * i <= n; i++) {
        if (n % i) continue;
        d.push_back(i);
        if (i != n / i) d.push_back(n / i);
    }
    sort(d.begin(), d.end());
    return d;
}

vector<int> divisor_count_table(int n) {
    vector<int> cnt(n + 1, 0);
    for (int i = 1; i <= n; i++)
        for (int j = i; j <= n; j += i) cnt[j]++;
    return cnt;
}`,
  },
  {
    id: "crt",
    name: "Chinese Remainder Theorem",
    category: "math",
    level: "advanced",
    complexity: "O(k log m)",
    tags: ["modular", "crt"],
    summary:
      "Merges congruences into one. This form does not need coprime moduli and reports contradictions instead of returning garbage.",
    usage: "auto r = crt({{2,3},{3,5},{2,7}});   // nullopt if inconsistent",
    code: String.raw`long long extgcd(long long a, long long b, long long &x, long long &y) {
    if (!b) { x = 1; y = 0; return a; }
    long long x1, y1; long long g = extgcd(b, a % b, x1, y1);
    x = y1; y = x1 - (a / b) * y1; return g;
}

optional<pair<long long,long long>> crt2(long long a1, long long m1,
                                         long long a2, long long m2) {
    long long p, q;
    long long g = extgcd(m1, m2, p, q);
    if ((a2 - a1) % g) return nullopt;
    long long lcm = m1 / g * m2;
    long long t = ((a2 - a1) / g % (m2 / g)) * p % (m2 / g);
    long long x = ((__int128)t * m1 + a1) % lcm;
    if (x < 0) x += lcm;
    return make_pair(x, lcm);
}

optional<pair<long long,long long>> crt(const vector<pair<long long,long long>> &eq) {
    long long a = 0, m = 1;
    for (auto [ai, mi] : eq) {
        auto r = crt2(a, m, ai % mi, mi);
        if (!r) return nullopt;
        a = r->first; m = r->second;
    }
    return make_pair(a, m);
}`,
  },
  {
    id: "combinatorics",
    name: "Factorials & nCr mod p",
    category: "math",
    level: "basic",
    complexity: "O(n) precompute, O(1) per query",
    tags: ["combinatorics", "modular"],
    summary:
      "Precomputed factorials and inverse factorials give constant-time binomials, permutations and stars-and-bars counts.",
    usage: "comb_init(200000); long long c = C(n, k);",
    variants:
      "Huge n with small prime p: use Lucas. Composite modulus: CRT over prime powers.",
    code: String.raw`const long long MOD = 1000000007;
vector<long long> fact_, inv_fact_;

long long bp(long long a, long long e, long long m) {
    long long r = 1; a %= m;
    while (e) { if (e & 1) r = r * a % m; a = a * a % m; e >>= 1; }
    return r;
}

void comb_init(int n) {
    fact_.assign(n + 1, 1);
    for (int i = 1; i <= n; i++) fact_[i] = fact_[i - 1] * i % MOD;
    inv_fact_.assign(n + 1, 1);
    inv_fact_[n] = bp(fact_[n], MOD - 2, MOD);
    for (int i = n; i > 0; i--) inv_fact_[i - 1] = inv_fact_[i] * i % MOD;
}

long long C(long long n, long long k) {
    if (k < 0 || n < 0 || k > n) return 0;
    return fact_[n] * inv_fact_[k] % MOD * inv_fact_[n - k] % MOD;
}

long long P(long long n, long long k) {
    if (k < 0 || k > n) return 0;
    return fact_[n] * inv_fact_[n - k] % MOD;
}`,
  },
  {
    id: "lucas",
    name: "Lucas' Theorem",
    category: "math",
    level: "advanced",
    complexity: "O(p + log_p n)",
    tags: ["combinatorics", "modular"],
    summary:
      "Binomial coefficient mod a small prime for astronomically large n, by multiplying binomials of the base-p digits.",
    usage: "long long c = lucas(1000000000000000000LL, 500000000000000000LL, 1000003);",
    code: String.raw`long long bp(long long a, long long e, long long m) {
    long long r = 1; a %= m;
    while (e) { if (e & 1) r = r * a % m; a = a * a % m; e >>= 1; }
    return r;
}

long long C_small(long long n, long long k, long long p) {
    if (k < 0 || k > n) return 0;
    long long num = 1, den = 1;
    for (long long i = 0; i < k; i++) {
        num = num * ((n - i) % p) % p;
        den = den * ((i + 1) % p) % p;
    }
    return num * bp(den, p - 2, p) % p;
}

long long lucas(long long n, long long k, long long p) {
    if (k == 0) return 1 % p;
    return lucas(n / p, k / p, p) * C_small(n % p, k % p, p) % p;
}`,
  },
  {
    id: "catalan",
    name: "Catalan Numbers",
    category: "math",
    level: "intermediate",
    complexity: "O(n^2) DP, O(1) closed form",
    tags: ["combinatorics", "counting"],
    summary:
      "Counts balanced bracket sequences, binary trees with n nodes, polygon triangulations and lattice paths that stay below the diagonal.",
    usage: "auto cat = catalan(1000);",
    variants:
      "Ballot numbers generalise this to paths bounded by a shifted diagonal (reflection formula).",
    code: String.raw`const long long MOD = 1000000007;

vector<long long> catalan(int n) {
    vector<long long> c(n + 1, 0);
    c[0] = 1;
    for (int i = 1; i <= n; i++)
        for (int j = 0; j < i; j++)
            c[i] = (c[i] + c[j] * c[i - 1 - j]) % MOD;
    return c;
}

// closed form C(2n,n)/(n+1) — needs comb_init + bp from the nCr snippet
long long catalan_fast(long long n) {
    return C(2 * n, n) * bp(n + 1, MOD - 2, MOD) % MOD;
}`,
  },
  {
    id: "matrix-power",
    name: "Matrix Exponentiation",
    category: "math",
    level: "intermediate",
    complexity: "O(k^3 log n)",
    tags: ["linear algebra", "recurrence"],
    summary:
      "Raises a transition matrix to the n-th power, turning any linear recurrence or fixed-transition DP into a logarithmic evaluation.",
    usage: "auto M = mat_pow({{1,1},{1,0}}, n);   // M[0][1] = fib(n)",
    variants:
      "Replace (+,*) with (min,+) for shortest-path powers, or OR/AND for reachability closure.",
    code: String.raw`using Mat = vector<vector<long long>>;
const long long MOD = 1000000007;

Mat mat_mul(const Mat &a, const Mat &b) {
    int n = a.size(), m = b[0].size(), k = b.size();
    Mat c(n, vector<long long>(m, 0));
    for (int i = 0; i < n; i++)
        for (int t = 0; t < k; t++) {
            if (!a[i][t]) continue;
            for (int j = 0; j < m; j++)
                c[i][j] = (c[i][j] + a[i][t] * b[t][j]) % MOD;
        }
    return c;
}

Mat mat_pow(Mat a, long long e) {
    int n = a.size();
    Mat r(n, vector<long long>(n, 0));
    for (int i = 0; i < n; i++) r[i][i] = 1;
    while (e) { if (e & 1) r = mat_mul(r, a); a = mat_mul(a, a); e >>= 1; }
    return r;
}`,
  },
  {
    id: "gauss",
    name: "Gaussian Elimination",
    category: "math",
    level: "advanced",
    complexity: "O(n^3)",
    tags: ["linear algebra", "system"],
    summary:
      "Solves a dense real linear system with partial pivoting and returns the rank, so unique / infinite / no solution are distinguishable.",
    usage: "vector<double> x; int rank = gauss(A, x);   // -1 = inconsistent",
    variants:
      "Over a prime field swap division for modular inverse; over GF(2) use the xor basis instead.",
    code: String.raw`const double EPS = 1e-9;

// A is n x (n+1) augmented
int gauss(vector<vector<double>> A, vector<double> &x) {
    int n = A.size(), m = n ? (int)A[0].size() - 1 : 0;
    vector<int> where(m, -1);
    for (int col = 0, row = 0; col < m && row < n; col++) {
        int sel = row;
        for (int i = row; i < n; i++)
            if (fabs(A[i][col]) > fabs(A[sel][col])) sel = i;
        if (fabs(A[sel][col]) < EPS) continue;
        swap(A[sel], A[row]);
        where[col] = row;
        for (int i = 0; i < n; i++) {
            if (i == row) continue;
            double c = A[i][col] / A[row][col];
            for (int j = col; j <= m; j++) A[i][j] -= A[row][j] * c;
        }
        row++;
    }
    x.assign(m, 0);
    int rank = 0;
    for (int j = 0; j < m; j++)
        if (where[j] != -1) { x[j] = A[where[j]][m] / A[where[j]][j]; rank++; }
    for (int i = 0; i < n; i++) {
        double sum = 0;
        for (int j = 0; j < m; j++) sum += x[j] * A[i][j];
        if (fabs(sum - A[i][m]) > EPS) return -1;
    }
    return rank;
}`,
  },
  {
    id: "xor-basis",
    name: "XOR Basis (Gauss over GF(2))",
    category: "math",
    level: "advanced",
    complexity: "O(n log C)",
    tags: ["linear algebra", "xor", "bitmask"],
    summary:
      "Keeps a basis of a multiset under XOR: answers representability, maximum XOR subset and the count of distinct XOR values.",
    usage: "XorBasis b; b.add(x); long long best = b.max_xor();",
    variants:
      "Store a time index per row for the 'basis of a suffix' trick; distinct values = 2^sz.",
    code: String.raw`struct XorBasis {
    static const int B = 62;
    array<long long, B> basis{};
    int sz = 0;

    bool add(long long x) {              // false if already representable
        for (int i = B - 1; i >= 0; i--) {
            if (!((x >> i) & 1)) continue;
            if (!basis[i]) { basis[i] = x; sz++; return true; }
            x ^= basis[i];
        }
        return false;
    }

    bool can(long long x) const {
        for (int i = B - 1; i >= 0; i--)
            if ((x >> i) & 1) { if (!basis[i]) return false; x ^= basis[i]; }
        return true;
    }

    long long max_xor(long long start = 0) const {
        long long r = start;
        for (int i = B - 1; i >= 0; i--)
            if (basis[i] && !((r >> i) & 1)) r ^= basis[i];
        return r;
    }
};`,
  },
  {
    id: "miller-rabin",
    name: "Miller-Rabin Primality Test",
    category: "math",
    level: "advanced",
    complexity: "O(k log^3 n)",
    tags: ["primes", "randomised"],
    summary:
      "Deterministic primality for every 64-bit integer using the known witness set. Effectively constant time where trial division is hopeless.",
    usage: "if (is_prime(1000000007LL)) ...",
    code: String.raw`long long mul_mod(long long a, long long b, long long m) { return (__int128)a * b % m; }

long long pw_mod(long long a, long long e, long long m) {
    long long r = 1; a %= m;
    while (e) { if (e & 1) r = mul_mod(r, a, m); a = mul_mod(a, a, m); e >>= 1; }
    return r;
}

bool is_prime(long long n) {
    if (n < 2) return false;
    for (long long p : {2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37})
        if (n % p == 0) return n == p;
    long long d = n - 1; int s = 0;
    while (!(d & 1)) { d >>= 1; s++; }
    for (long long a : {2, 325, 9375, 28178, 450775, 9780504, 1795265022}) {
        long long x = pw_mod(a % n, d, n);
        if (x == 1 || x == n - 1) continue;
        bool composite = true;
        for (int i = 1; i < s; i++) {
            x = mul_mod(x, x, n);
            if (x == n - 1) { composite = false; break; }
        }
        if (composite) return false;
    }
    return true;
}`,
  },
  {
    id: "pollard-rho",
    name: "Pollard's Rho Factorisation",
    category: "math",
    level: "advanced",
    complexity: "~O(n^(1/4))",
    tags: ["factorisation", "randomised"],
    summary:
      "Factorises 64-bit integers well past sqrt-time reach by extracting a non-trivial gcd from a pseudo-random cycle. Pair with Miller-Rabin to recurse.",
    usage: "auto f = factor(1000000007000000009LL);",
    code: String.raw`// needs mul_mod / pw_mod / is_prime from the Miller-Rabin snippet
long long pollard(long long n) {
    if (n % 2 == 0) return 2;
    static mt19937_64 rng(chrono::steady_clock::now().time_since_epoch().count());
    while (true) {
        long long x = rng() % (n - 2) + 2, y = x, c = rng() % (n - 1) + 1, d = 1;
        while (d == 1) {
            x = (mul_mod(x, x, n) + c) % n;
            y = (mul_mod(y, y, n) + c) % n;
            y = (mul_mod(y, y, n) + c) % n;
            if (x == y) break;
            d = __gcd(x > y ? x - y : y - x, n);
        }
        if (d != 1 && d != n) return d;
    }
}

void factor_rec(long long n, vector<long long> &out) {
    if (n == 1) return;
    if (is_prime(n)) { out.push_back(n); return; }
    long long d = pollard(n);
    factor_rec(d, out);
    factor_rec(n / d, out);
}

vector<long long> factor(long long n) {
    vector<long long> out;
    factor_rec(n, out);
    sort(out.begin(), out.end());
    return out;
}`,
  },
  {
    id: "mobius",
    name: "Mobius Function & Inversion",
    category: "math",
    level: "advanced",
    complexity: "O(n)",
    tags: ["number theory", "inclusion-exclusion"],
    summary:
      "mu(n) is the signed indicator of squarefree numbers. Weighting a divisor sum by mu converts 'count pairs with gcd 1' into a short loop.",
    usage: "auto mu = mobius_table(1000000);",
    code: String.raw`vector<int> mobius_table(int n) {
    vector<int> mu(n + 1, 0), primes;
    vector<bool> comp(n + 1, false);
    mu[1] = 1;
    for (int i = 2; i <= n; i++) {
        if (!comp[i]) { primes.push_back(i); mu[i] = -1; }
        for (int p : primes) {
            if ((long long)p * i > n) break;
            comp[p * i] = true;
            mu[p * i] = (i % p == 0) ? 0 : -mu[i];
            if (i % p == 0) break;
        }
    }
    return mu;
}

long long coprime_pairs(int n, int m, const vector<int> &mu) {
    long long res = 0;
    for (int d = 1; d <= min(n, m); d++) res += (long long)mu[d] * (n / d) * (m / d);
    return res;
}`,
  },
  {
    id: "discrete-log",
    name: "Discrete Logarithm (BSGS)",
    category: "math",
    level: "advanced",
    complexity: "O(sqrt m log m)",
    tags: ["modular", "meet in the middle"],
    summary:
      "Solves a^x = b (mod m) with baby-step giant-step: hash small powers, then jump in strides of sqrt(m).",
    usage: "long long x = bsgs(a, b, m);   // -1 when unsolvable",
    variants: "Needs gcd(a,m)=1; strip common factors first for the general case.",
    code: String.raw`long long bsgs(long long a, long long b, long long m) {
    a %= m; b %= m;
    if (m == 1) return 0;
    long long n = (long long)sqrtl((long double)m) + 1, an = 1;
    for (long long i = 0; i < n; i++) an = (__int128)an * a % m;

    unordered_map<long long, long long> vals;
    long long cur = 1;
    for (long long p = 1; p <= n; p++) {
        cur = (__int128)cur * an % m;
        if (!vals.count(cur)) vals[cur] = p;
    }

    cur = b;
    for (long long q = 0; q <= n; q++) {
        auto it = vals.find(cur);
        if (it != vals.end()) {
            long long ans = it->second * n - q;
            if (ans >= 0) return ans;
        }
        cur = (__int128)cur * a % m;
    }
    return -1;
}`,
  },
  {
    id: "fft",
    name: "FFT Polynomial Multiplication",
    category: "math",
    level: "advanced",
    complexity: "O(n log n)",
    tags: ["fft", "convolution"],
    summary:
      "Multiplies two sequences with the complex FFT. Every 'count pairs with sum k' problem is a convolution in disguise.",
    usage: "auto c = multiply(a, b);   // c[k] = sum a[i]*b[k-i]",
    variants:
      "For exact results mod 998244353 use NTT (same butterfly, roots from the modulus). Split into 15-bit halves for large coefficients.",
    code: String.raw`using cd = complex<double>;

void fft(vector<cd> &a, bool invert) {
    int n = a.size();
    for (int i = 1, j = 0; i < n; i++) {
        int bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) swap(a[i], a[j]);
    }
    for (int len = 2; len <= n; len <<= 1) {
        double ang = 2 * acos(-1.0) / len * (invert ? -1 : 1);
        cd wl(cos(ang), sin(ang));
        for (int i = 0; i < n; i += len) {
            cd w(1);
            for (int j = 0; j < len / 2; j++) {
                cd u = a[i + j], v = a[i + j + len / 2] * w;
                a[i + j] = u + v;
                a[i + j + len / 2] = u - v;
                w *= wl;
            }
        }
    }
    if (invert) for (cd &x : a) x /= n;
}

vector<long long> multiply(const vector<long long> &a, const vector<long long> &b) {
    if (a.empty() || b.empty()) return {};
    vector<cd> fa(a.begin(), a.end()), fb(b.begin(), b.end());
    int n = 1;
    while (n < (int)(a.size() + b.size())) n <<= 1;
    fa.resize(n); fb.resize(n);
    fft(fa, false); fft(fb, false);
    for (int i = 0; i < n; i++) fa[i] *= fb[i];
    fft(fa, true);
    vector<long long> res(a.size() + b.size() - 1);
    for (size_t i = 0; i < res.size(); i++) res[i] = llround(fa[i].real());
    return res;
}`,
  },
];

export default algos;
