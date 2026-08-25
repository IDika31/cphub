export type AlgoLevel = "basic" | "intermediate" | "advanced";

export interface Algo {
  /** Stable slug, used as React key and for deep links. */
  id: string;
  name: string;
  category: string;
  level: AlgoLevel;
  /** Time complexity, and space when it is the interesting part. */
  complexity: string;
  tags: string[];
  /** What it does and when to reach for it. */
  summary: string;
  /** How to call it from your solution. */
  usage: string;
  /** Common modifications of the textbook version. */
  variants?: string;
  /**
   * Pasteable C++17. No includes and no main: it drops into a file that already
   * has <bits/stdc++.h> and `using namespace std;`, which is what the editor
   * template gives you.
   */
  code: string;
}

export interface AlgoCategory {
  id: string;
  label: string;
}

export const CATEGORIES: AlgoCategory[] = [
  { id: "math", label: "Math & Number Theory" },
  { id: "sorting", label: "Sorting & Searching" },
  { id: "ds", label: "Data Structures" },
  { id: "graph", label: "Graphs" },
  { id: "graph-advanced", label: "Flows & Matching" },
  { id: "tree", label: "Trees" },
  { id: "dp", label: "Dynamic Programming" },
  { id: "string", label: "Strings" },
  { id: "geometry", label: "Geometry" },
  { id: "misc", label: "Techniques" },
];

export const LEVEL_ORDER: Record<AlgoLevel, number> = {
  basic: 0,
  intermediate: 1,
  advanced: 2,
};
