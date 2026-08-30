import { expect, test } from "bun:test";
import { diffLines, diffStat, collapseUnchanged } from "../src/lib/diff";

test("identical text has no changes", () => {
  const d = diffLines("a\nb\nc", "a\nb\nc");
  expect(d.every((l) => l.kind === "same")).toBe(true);
  expect(diffStat(d)).toEqual({ added: 0, removed: 0 });
});

test("a changed line reads as the old one leaving and the new one arriving", () => {
  const d = diffLines("int main(){\n  int n;\n}", "int main(){\n  long long n;\n}");
  expect(d.map((l) => l.kind)).toEqual(["same", "removed", "added", "same"]);
  // The order matters for reading: what was there, then what replaced it.
  expect(d[1].text).toContain("int n;");
  expect(d[2].text).toContain("long long n;");
});

test("line numbers point back at the file each line came from", () => {
  const d = diffLines("a\nb", "a\nx\nb");
  const added = d.find((l) => l.kind === "added");
  expect(added?.newLine).toBe(2);
  expect(added?.oldLine).toBeUndefined();
  const last = d[d.length - 1];
  expect(last.oldLine).toBe(2);
  expect(last.newLine).toBe(3);
});

test("insertions and deletions at the ends are not lost", () => {
  expect(diffStat(diffLines("a\nb", "a\nb\nc\nd"))).toEqual({ added: 2, removed: 0 });
  expect(diffStat(diffLines("a\nb\nc", "c"))).toEqual({ added: 0, removed: 2 });
});

test("an empty side is all additions or all removals", () => {
  expect(diffStat(diffLines("", "a\nb"))).toEqual({ added: 2, removed: 1 });
  expect(diffStat(diffLines("a\nb", ""))).toEqual({ added: 1, removed: 2 });
});

test("unchanged stretches collapse to a marker, changes keep their context", () => {
  const oldText = Array.from({ length: 30 }, (_, i) => `line ${i}`).join("\n");
  const newText = oldText.replace("line 15", "line 15 changed");
  const collapsed = collapseUnchanged(diffLines(oldText, newText), 2);
  // A separator stands in for the skipped run, and the changed lines survive with their
  // neighbours.
  expect(collapsed.some((l) => l === null)).toBe(true);
  expect(collapsed.some((l) => l?.kind === "added" && l.text.includes("changed"))).toBe(true);
  expect(collapsed.filter((l) => l !== null).length).toBeLessThan(30);
});

test("CRLF does not read as a change against LF", () => {
  expect(diffStat(diffLines("a\r\nb\r\n", "a\nb\n"))).toEqual({ added: 0, removed: 0 });
});
