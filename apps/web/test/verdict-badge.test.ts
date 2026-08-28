import { expect, test } from "bun:test";
import { verdictVariant } from "../src/components/ui/badge";

/**
 * The verdicts each judge actually sends, and the colour each has to end up with.
 *
 * This exists because the mapping used to be `verdict-${verdict.toLowerCase()}`, which
 * matched exactly six spellings — ac, wa, tle, ce, re, pending — and produced an
 * undefined style for everything else. Codeforces' own vocabulary is the long form, so
 * most of the Submissions table rendered as unstyled grey text.
 */
// Typed off the function itself, so a variant that is not in Badge's own union is a
// compile error here rather than a badge with no colour in production.
const CASES: Array<[string, ReturnType<typeof verdictVariant>]> = [
  // Codeforces, as user.status returns it.
  ["OK", "verdict-ac"],
  ["WRONG_ANSWER", "verdict-wa"],
  ["TIME_LIMIT_EXCEEDED", "verdict-tle"],
  ["MEMORY_LIMIT_EXCEEDED", "verdict-mle"],
  ["IDLENESS_LIMIT_EXCEEDED", "verdict-mle"],
  ["RUNTIME_ERROR", "verdict-re"],
  ["COMPILATION_ERROR", "verdict-ce"],
  ["TESTING", "verdict-pending"],
  ["SKIPPED", "verdict-other"],
  ["CHALLENGED", "verdict-other"],
  // TLX / Judgels.
  ["AC", "verdict-ac"],
  ["WA", "verdict-wa"],
  ["TLE", "verdict-tle"],
  ["MLE", "verdict-mle"],
  ["RTE", "verdict-re"],
  ["CE", "verdict-ce"],
  ["PARTIAL", "verdict-partial"],
  // A pending Judgels submission is literally a question mark.
  ["?", "verdict-pending"],
  // CPHub's own grader.
  ["RE", "verdict-re"],
  ["PENDING", "verdict-pending"],
];

test("every verdict a judge sends maps to a real style", () => {
  for (const [verdict, want] of CASES) {
    expect(verdictVariant(verdict)).toBe(want);
  }
});

test("case and whitespace do not decide the colour", () => {
  expect(verdictVariant(" ok ")).toBe("verdict-ac");
  expect(verdictVariant("Wrong_Answer")).toBe("verdict-wa");
});

test("an empty verdict reads as pending, not as something else", () => {
  // A row synced before its verdict landed carries "", and the judge has not spoken
  // yet — that is pending, not a failure.
  expect(verdictVariant("")).toBe("verdict-pending");
});

test("a verdict nobody has seen before is still legible", () => {
  // The point of the fallback: a new Codeforces verdict must render as text on a
  // visible badge rather than as an undefined class.
  expect(verdictVariant("SOME_NEW_VERDICT")).toBe("verdict-other");
});
