import { expect, test } from "bun:test";
import { decideContestState, type RawContestRow } from "../src/shared/cf-contests";

/**
 * Rows as codeforces.com/contests actually renders them, captured 2026-08-27 by
 * apps/api/internal/provider/codeforces/web_contests_shape_test.go against a logged-in
 * session. The registration cell's text, its countdown title and whether it links to the
 * registration page are what the injected scraper hands over.
 */
const REGISTERED: RawContestRow = {
  contestRef: "2258",
  cellText: "Registration completed x10891",
  countdownTitle: "",
  hasRegisterLink: false,
};

const NOT_OPEN_YET: RawContestRow = {
  contestRef: "2259",
  cellText: "Before registration 5 days",
  countdownTitle: "129:08:09",
  hasRegisterLink: false,
};

// Registration open and this account not in it: Codeforces offers the link. Cell text as
// the page renders it, registrant count and closing countdown included.
const OPEN: RawContestRow = {
  contestRef: "2258",
  cellText: "Register » x10889 Until closing 38:39:28 *has extra registration",
  // The registrant-count link carries title="Registered"; the scraper prefers the
  // countdown's own title, and an open row has none.
  countdownTitle: "",
  hasRegisterLink: true,
};

test("a completed registration is read as registered", () => {
  const state = decideContestState(REGISTERED);
  expect(state).toEqual({ contestRef: "2258", registered: true });
});

test("a registration that has not opened carries an absolute instant", () => {
  // Fixed clock so the conversion is checkable rather than approximate.
  const now = Date.parse("2026-08-27T04:00:00.000Z");
  const state = decideContestState(NOT_OPEN_YET, now);

  expect(state.registered).toBe(false);
  // 129:08:09 after the fixed clock. Codeforces states this relatively, and storing it
  // relatively is what would go stale.
  expect(state.registrationOpensAt).toBe("2026-09-01T13:08:09.000Z");
});

test("H in the countdown is hours, not a clock time", () => {
  const now = Date.parse("2026-08-27T00:00:00.000Z");
  const state = decideContestState(
    { contestRef: "1", cellText: "Before registration 12 days", countdownTitle: "297:43:09", hasRegisterLink: false },
    now,
  );
  // 297 h is over twelve days: reading it as a 24-hour clock would land the same day.
  expect(state.registrationOpensAt).toBe("2026-09-08T09:43:09.000Z");
});

test("a registration link means open and not registered", () => {
  expect(decideContestState(OPEN)).toEqual({ contestRef: "2258", registered: false });
});

/**
 * The row shapes that used to be read as "not registered" by elimination. The server
 * deletes a registration on a false, so each of these erased a registration the user
 * really had. The second string is a past contest's cell as the page renders it: the
 * registrant count and nothing else, a hundred rows of it per page.
 */
test("a row that states nothing reports nothing, not not-registered", () => {
  for (const cellText of ["", "x25671", "Enter »", "Final standings"]) {
    const state = decideContestState({ contestRef: "2262", cellText, countdownTitle: "", hasRegisterLink: false });
    expect(state.registered).toBeUndefined();
    expect(state.contestRef).toBe("2262");
  }
});

test("an unreadable countdown still reports not-registered rather than nothing", () => {
  // "Before registration" is itself the statement, so the row stays readable even when the
  // title's shape changes. Leaving registrationOpensAt unset makes the UI offer the button
  // and let Codeforces decide, which is the safe direction.
  const state = decideContestState({
    contestRef: "9",
    cellText: "Before registration soon",
    countdownTitle: "tomorrow",
    hasRegisterLink: false,
  });
  expect(state.registered).toBe(false);
  expect(state.registrationOpensAt).toBeUndefined();
});

test("the contest ref survives verbatim", () => {
  // It is the join key against CPHub's own contest rows, so a mangled ref silently
  // detaches the state from its contest.
  expect(decideContestState({ ...OPEN, contestRef: "2260" }).contestRef).toBe("2260");
});

// A running contest keeps saying "Registration completed" — measured on 2251, mid-round —
// so the contest list can still answer "am I in this one" while it runs.
test("a running contest the account is in still reads as registered", () => {
  const state = decideContestState({
    contestRef: "2251",
    cellText: "Registration completed x33635",
    countdownTitle: "",
    hasRegisterLink: false,
  });
  expect(state).toEqual({ contestRef: "2251", registered: true });
});
