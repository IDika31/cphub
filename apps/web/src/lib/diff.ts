/**
 * Line diff, for comparing one stored attempt against another.
 *
 * Small on purpose: the question a problem page asks is "what changed between the WA and
 * the AC", and two versions of one file answer that with line-level granularity. No
 * dependency for it — a longest-common-subsequence table over lines is a dozen lines of
 * code, and pulling a diff library in for it would ship a parser we do not need.
 */

export type DiffKind = "same" | "added" | "removed";

export interface DiffLine {
  kind: DiffKind;
  text: string;
  /** 1-based line number in the old text, absent for an added line. */
  oldLine?: number;
  /** 1-based line number in the new text, absent for a removed line. */
  newLine?: number;
}

/** Guards the LCS table: 4000x4000 is already 16M cells, and no competitive-programming
 *  solution is four thousand lines. Beyond it the diff degrades to "everything changed",
 *  which is honest and instant rather than a frozen tab. */
const MAX_LINES = 4000;

export function diffLines(oldText: string, newText: string): DiffLine[] {
  const a = oldText.replace(/\r\n/g, "\n").split("\n");
  const b = newText.replace(/\r\n/g, "\n").split("\n");

  if (a.length > MAX_LINES || b.length > MAX_LINES) {
    return [
      ...a.map((text, i) => ({ kind: "removed" as const, text, oldLine: i + 1 })),
      ...b.map((text, i) => ({ kind: "added" as const, text, newLine: i + 1 })),
    ];
  }

  // lcs[i][j] = length of the longest common subsequence of a[i:] and b[j:].
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i], oldLine: i + 1, newLine: j + 1 });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      // Removals before additions at the same position, so a replaced line reads as
      // "this went, that came" in the order a person would say it.
      out.push({ kind: "removed", text: a[i], oldLine: i + 1 });
      i++;
    } else {
      out.push({ kind: "added", text: b[j], newLine: j + 1 });
      j++;
    }
  }
  while (i < a.length) out.push({ kind: "removed", text: a[i], oldLine: ++i });
  while (j < b.length) out.push({ kind: "added", text: b[j], newLine: ++j });
  return out;
}

/** How many lines differ, for a one-line summary next to the toggle. */
export function diffStat(lines: DiffLine[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const l of lines) {
    if (l.kind === "added") added++;
    if (l.kind === "removed") removed++;
  }
  return { added, removed };
}

/** Drops long stretches of unchanged lines, keeping `context` of them around each change
 *  — the same idea as a unified diff's hunks. A gap is marked by a null so the caller can
 *  render a separator. */
export function collapseUnchanged(lines: DiffLine[], context = 3): Array<DiffLine | null> {
  const keep = new Array(lines.length).fill(false);
  lines.forEach((line, idx) => {
    if (line.kind === "same") return;
    for (let k = Math.max(0, idx - context); k <= Math.min(lines.length - 1, idx + context); k++) {
      keep[k] = true;
    }
  });
  const out: Array<DiffLine | null> = [];
  let skipping = false;
  lines.forEach((line, idx) => {
    if (keep[idx]) {
      out.push(line);
      skipping = false;
    } else if (!skipping) {
      out.push(null);
      skipping = true;
    }
  });
  return out;
}
