import type { Algo } from "./types";

const algos: Algo[] = [
  {
    id: "point-basics",
    name: "Point / Vector Primitives",
    category: "geometry",
    level: "basic",
    complexity: "O(1)",
    tags: ["vector", "cross product", "orientation"],
    summary:
      "Integer point struct with dot, cross and orientation. Keeping coordinates integral avoids epsilon bugs entirely, which is why cross-product sign beats slope comparison.",
    usage: "if (cross(b - a, c - a) > 0) /* c is left of ab */",
    variants:
      "For doubles, compare against an epsilon and use long double for hypot-heavy work.",
    code: String.raw`struct P {
    long long x = 0, y = 0;
    P operator+(const P &o) const { return {x + o.x, y + o.y}; }
    P operator-(const P &o) const { return {x - o.x, y - o.y}; }
    bool operator<(const P &o) const { return x != o.x ? x < o.x : y < o.y; }
    bool operator==(const P &o) const { return x == o.x && y == o.y; }
};

long long cross(const P &a, const P &b) { return a.x * b.y - a.y * b.x; }
long long dot(const P &a, const P &b) { return a.x * b.x + a.y * b.y; }
long long dist2(const P &a, const P &b) { return dot(b - a, b - a); }

int sgn(long long v) { return (v > 0) - (v < 0); }

// +1 counter-clockwise, -1 clockwise, 0 collinear
int orient(const P &a, const P &b, const P &c) { return sgn(cross(b - a, c - a)); }`,
  },
  {
    id: "segment-intersection",
    name: "Segment Intersection Test",
    category: "geometry",
    level: "intermediate",
    complexity: "O(1)",
    tags: ["segments", "orientation", "collinear"],
    summary:
      "Two segments cross when each straddles the other's line; collinear cases need an explicit overlap check. Pure integer arithmetic, no divisions.",
    usage: "if (segments_intersect(a, b, c, d)) ...",
    code: String.raw`// needs the point primitives
bool on_segment(const P &a, const P &b, const P &p) {
    return orient(a, b, p) == 0 &&
           min(a.x, b.x) <= p.x && p.x <= max(a.x, b.x) &&
           min(a.y, b.y) <= p.y && p.y <= max(a.y, b.y);
}

bool segments_intersect(const P &a, const P &b, const P &c, const P &d) {
    int d1 = orient(a, b, c), d2 = orient(a, b, d);
    int d3 = orient(c, d, a), d4 = orient(c, d, b);
    if (d1 * d2 < 0 && d3 * d4 < 0) return true;
    return on_segment(a, b, c) || on_segment(a, b, d) ||
           on_segment(c, d, a) || on_segment(c, d, b);
}`,
  },
  {
    id: "polygon-area",
    name: "Polygon Area (shoelace)",
    category: "geometry",
    level: "basic",
    complexity: "O(n)",
    tags: ["area", "shoelace", "pick"],
    summary:
      "Twice the signed area is the sum of cross products around the boundary. The sign gives orientation, and with Pick's theorem it counts lattice points.",
    usage: "long long a2 = area2(poly);   // area = a2 / 2.0",
    variants:
      "Pick's theorem: interior lattice points = area - boundary/2 + 1, where boundary counts gcd(dx, dy) per edge.",
    code: String.raw`// needs the point primitives
long long area2(const vector<P> &p) {           // twice the signed area
    long long s = 0;
    int n = p.size();
    for (int i = 0; i < n; i++) s += cross(p[i], p[(i + 1) % n]);
    return s;                                    // > 0 means counter-clockwise
}

long long boundary_points(const vector<P> &p) {
    long long b = 0;
    int n = p.size();
    for (int i = 0; i < n; i++) {
        P d = p[(i + 1) % n] - p[i];
        b += __gcd(llabs(d.x), llabs(d.y));
    }
    return b;
}

// Pick: interior = (2*Area - boundary + 2) / 2
long long interior_points(const vector<P> &p) {
    return (llabs(area2(p)) - boundary_points(p) + 2) / 2;
}`,
  },
  {
    id: "point-in-polygon",
    name: "Point in Polygon (ray casting)",
    category: "geometry",
    level: "intermediate",
    complexity: "O(n)",
    tags: ["inclusion", "ray casting", "winding"],
    summary:
      "Counts boundary crossings of a rightward ray: odd means inside. Boundary points are reported separately because most problems treat them as a special case.",
    usage: "int r = point_in_polygon(poly, q);   // 1 in, 0 on, -1 out",
    code: String.raw`// needs the point primitives and on_segment
int point_in_polygon(const vector<P> &poly, const P &q) {
    int n = poly.size(), crossings = 0;
    for (int i = 0; i < n; i++) {
        const P &a = poly[i], &b = poly[(i + 1) % n];
        if (on_segment(a, b, q)) return 0;                 // on the boundary
        if (a.y == b.y) continue;
        long long lo = min(a.y, b.y), hi = max(a.y, b.y);
        if (q.y < lo || q.y >= hi) continue;
        long double xAt = a.x + (long double)(b.x - a.x) * (q.y - a.y) / (b.y - a.y);
        if (xAt > q.x) crossings++;
    }
    return (crossings & 1) ? 1 : -1;
}`,
  },
  {
    id: "convex-hull",
    name: "Convex Hull (monotone chain)",
    category: "geometry",
    level: "intermediate",
    complexity: "O(n log n)",
    tags: ["convex hull", "andrew", "sorting"],
    summary:
      "Sorts points and builds the lower then upper chain, keeping only right turns. The base of diameter, width, and 'maximise a linear function' queries.",
    usage: "auto hull = convex_hull(pts);   // counter-clockwise, no duplicates",
    variants:
      "Use <= 0 in the pop test to drop collinear points, or < 0 to keep them.",
    code: String.raw`// needs the point primitives
vector<P> convex_hull(vector<P> p) {
    sort(p.begin(), p.end());
    p.erase(unique(p.begin(), p.end()), p.end());
    if (p.size() < 3) return p;

    vector<P> h;
    for (int pass = 0; pass < 2; pass++) {          // lower hull, then upper
        size_t start = h.size();
        for (const P &q : p) {
            while (h.size() >= start + 2 &&
                   cross(h[h.size() - 1] - h[h.size() - 2], q - h[h.size() - 2]) <= 0)
                h.pop_back();
            h.push_back(q);
        }
        h.pop_back();
        reverse(p.begin(), p.end());
    }
    return h;
}`,
  },
  {
    id: "point-in-convex",
    name: "Point in Convex Polygon (log n)",
    category: "geometry",
    level: "advanced",
    complexity: "O(log n) per query",
    tags: ["convex", "binary search", "inclusion"],
    summary:
      "Fans the polygon from vertex 0 and binary searches the wedge containing the query, then does one orientation test. Needed when there are many queries.",
    usage: "bool inside = in_convex(hull, q);   // hull counter-clockwise",
    code: String.raw`// needs the point primitives; hull must be CCW without collinear points
bool in_convex(const vector<P> &h, const P &q) {
    int n = h.size();
    if (n < 3) return false;
    if (cross(h[1] - h[0], q - h[0]) < 0) return false;
    if (cross(h[n - 1] - h[0], q - h[0]) > 0) return false;

    int lo = 1, hi = n - 1;
    while (hi - lo > 1) {                           // find the wedge
        int mid = (lo + hi) / 2;
        if (cross(h[mid] - h[0], q - h[0]) >= 0) lo = mid;
        else hi = mid;
    }
    return cross(h[lo + 1] - h[lo], q - h[lo]) >= 0;
}`,
  },
  {
    id: "rotating-calipers",
    name: "Rotating Calipers (diameter)",
    category: "geometry",
    level: "advanced",
    complexity: "O(n) after the hull",
    tags: ["convex hull", "diameter", "two pointers"],
    summary:
      "Walks two antipodal pointers around a convex hull to find the farthest pair, minimum width, or the smallest enclosing rectangle in linear time.",
    usage: "long long d2 = hull_diameter2(hull);",
    code: String.raw`// needs the point primitives; h is a CCW convex hull
long long hull_diameter2(const vector<P> &h) {
    int n = h.size();
    if (n < 2) return 0;
    if (n == 2) return dist2(h[0], h[1]);

    long long best = 0;
    int j = 1;
    for (int i = 0; i < n; i++) {
        P edge = h[(i + 1) % n] - h[i];
        while (cross(edge, h[(j + 1) % n] - h[j]) > 0) j = (j + 1) % n;
        best = max({best, dist2(h[i], h[j]), dist2(h[(i + 1) % n], h[j])});
    }
    return best;
}`,
  },
  {
    id: "closest-pair",
    name: "Closest Pair of Points",
    category: "geometry",
    level: "advanced",
    complexity: "O(n log n)",
    tags: ["sweep line", "divide and conquer", "set"],
    summary:
      "Sweeps left to right keeping a candidate window sorted by y, so only a constant number of points per step can beat the current best distance.",
    usage: "long long d2 = closest_pair(pts);",
    code: String.raw`// needs the point primitives
long long closest_pair(vector<P> p) {
    sort(p.begin(), p.end());
    set<pair<long long,long long>> box;             // (y, x) of the active window
    long long best = LLONG_MAX;
    int left = 0;
    for (size_t i = 0; i < p.size(); i++) {
        long long d = (long long)ceill(sqrtl((long double)best));
        while (left < (int)i && p[i].x - p[left].x > d) {
            box.erase({p[left].y, p[left].x});
            left++;
        }
        auto lo = box.lower_bound({p[i].y - d, LLONG_MIN});
        auto hi = box.upper_bound({p[i].y + d, LLONG_MAX});
        for (auto it = lo; it != hi; ++it) {
            P q{it->second, it->first};
            best = min(best, dist2(p[i], q));
        }
        box.insert({p[i].y, p[i].x});
    }
    return best;
}`,
  },
  {
    id: "polar-sort",
    name: "Polar (angular) Sort",
    category: "geometry",
    level: "intermediate",
    complexity: "O(n log n)",
    tags: ["sorting", "angles", "half plane"],
    summary:
      "Sorts points by angle around an origin using half-plane comparison plus cross product, with no atan2 and no floating point.",
    usage: "sort(pts.begin(), pts.end(), polar_less);",
    variants:
      "Duplicate the array with angles + 2*pi to run a two-pointer sweep over angular windows.",
    code: String.raw`// needs the point primitives
int half(const P &p) {                            // 0 for upper half, 1 for lower
    return (p.y < 0 || (p.y == 0 && p.x < 0)) ? 1 : 0;
}

bool polar_less(const P &a, const P &b) {
    int ha = half(a), hb = half(b);
    if (ha != hb) return ha < hb;
    long long c = cross(a, b);
    if (c != 0) return c > 0;
    return dot(a, a) < dot(b, b);                 // closer first when collinear
}`,
  },
  {
    id: "line-circle",
    name: "Line & Circle Intersections",
    category: "geometry",
    level: "advanced",
    complexity: "O(1)",
    tags: ["circle", "intersection", "floating point"],
    summary:
      "Intersection points of a line with a circle, and of two circles, via projection and the perpendicular offset. Handles tangency through the discriminant sign.",
    usage: "auto pts = circle_line({0,0}, 5, a, b);",
    code: String.raw`struct Pt { long double x = 0, y = 0; };

Pt operator+(Pt a, Pt b) { return {a.x + b.x, a.y + b.y}; }
Pt operator-(Pt a, Pt b) { return {a.x - b.x, a.y - b.y}; }
Pt operator*(Pt a, long double k) { return {a.x * k, a.y * k}; }
long double dotf(Pt a, Pt b) { return a.x * b.x + a.y * b.y; }
long double absf(Pt a) { return sqrtl(dotf(a, a)); }

vector<Pt> circle_line(Pt c, long double r, Pt a, Pt b) {
    Pt d = b - a;
    long double len = absf(d);
    Pt dir = d * (1.0L / len);
    long double t = dotf(c - a, dir);
    Pt closest = a + dir * t;
    long double h2 = r * r - dotf(c - closest, c - closest);
    if (h2 < -1e-12L) return {};
    if (h2 < 1e-12L) return {closest};
    long double h = sqrtl(h2);
    return {closest - dir * h, closest + dir * h};
}

vector<Pt> circle_circle(Pt c1, long double r1, Pt c2, long double r2) {
    Pt d = c2 - c1;
    long double dist = absf(d);
    if (dist > r1 + r2 + 1e-12L || dist < fabsl(r1 - r2) - 1e-12L || dist < 1e-12L) return {};
    long double a = (r1 * r1 - r2 * r2 + dist * dist) / (2 * dist);
    long double h2 = r1 * r1 - a * a;
    Pt dir = d * (1.0L / dist);
    Pt base = c1 + dir * a;
    if (h2 < 1e-12L) return {base};
    long double h = sqrtl(h2);
    Pt perp{-dir.y, dir.x};
    return {base + perp * h, base - perp * h};
}`,
  },
  {
    id: "min-enclosing-circle",
    name: "Minimum Enclosing Circle (Welzl)",
    category: "geometry",
    level: "advanced",
    complexity: "O(n) expected",
    tags: ["circle", "randomised", "covering"],
    summary:
      "Smallest circle covering all points. Random shuffling makes the incremental construction linear in expectation, so no LP is needed.",
    usage: "auto [c, r] = min_enclosing_circle(pts);",
    code: String.raw`// uses the Pt / dotf / absf helpers from the circle snippet
pair<Pt, long double> circle_from(Pt a, Pt b) {
    Pt c{(a.x + b.x) / 2, (a.y + b.y) / 2};
    return {c, absf(a - c)};
}

pair<Pt, long double> circle_from3(Pt a, Pt b, Pt c) {
    Pt B{b.x - a.x, b.y - a.y}, C{c.x - a.x, c.y - a.y};
    long double d = 2 * (B.x * C.y - B.y * C.x);
    if (fabsl(d) < 1e-18L) return {a, 0};
    long double bx = dotf(B, B), cy = dotf(C, C);
    Pt cen{a.x + (C.y * bx - B.y * cy) / d, a.y + (B.x * cy - C.x * bx) / d};
    return {cen, absf(a - cen)};
}

pair<Pt, long double> min_enclosing_circle(vector<Pt> p) {
    static mt19937_64 rng(chrono::steady_clock::now().time_since_epoch().count());
    shuffle(p.begin(), p.end(), rng);
    Pt c{0, 0};
    long double r = 0;
    for (size_t i = 0; i < p.size(); i++) {
        if (absf(p[i] - c) <= r + 1e-9L) continue;
        c = p[i]; r = 0;
        for (size_t j = 0; j < i; j++) {
            if (absf(p[j] - c) <= r + 1e-9L) continue;
            tie(c, r) = circle_from(p[i], p[j]);
            for (size_t k = 0; k < j; k++)
                if (absf(p[k] - c) > r + 1e-9L) tie(c, r) = circle_from3(p[i], p[j], p[k]);
        }
    }
    return {c, r};
}`,
  },
];

export default algos;
