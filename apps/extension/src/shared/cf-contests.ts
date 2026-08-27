/**
 * Contest registration and its state, read and done in the user's own browser.
 *
 * Registration state is the interesting half. Codeforces exposes it in no API — its own
 * contest.standings refuses a contest that has not started, which is exactly when
 * registration is open, and there is no registrants method — but codeforces.com/contests
 * shows all three states for every upcoming round in one page, and only for a signed-in
 * user. So one page read here answers what the server cannot answer at all, including
 * registrations the user made directly on Codeforces.
 */

import { inCodeforcesTab, type PageResult } from "./cf-tab";
import { logger } from "./logger";

export interface CFContestState {
  contestRef: string;
  /**
   * Tri-state on purpose. `true` and `false` are things the page said; `undefined` means
   * it said nothing this parser understands, and the two must not be conflated: the
   * server DELETES a registration on `false`, so reporting "unreadable" as "not
   * registered" erases a registration the user really has. A running round is exactly
   * that case — once registration closes Codeforces stops printing "Registration
   * completed" — and so is every row whose markup changes.
   */
  registered?: boolean;
  /** ISO instant when registration opens, when the page said it had not yet. Absent
   *  means open already, or not stated. */
  registrationOpensAt?: string;
}

/** One row as read off the page, before any decision is made about it. */
export interface RawContestRow {
  contestRef: string;
  /** The registration cell's text, whitespace collapsed. */
  cellText: string;
  /** The countdown title inside that cell, e.g. "129:08:09". Empty when absent. */
  countdownTitle: string;
  /** True when the cell offers a link to the registration page. That link is the
   *  positive marker for "registration is open and this account is not in it" — without
   *  it, "not registered" would have to be guessed from the absence of other phrases. */
  hasRegisterLink: boolean;
}

/** Reads the state of every upcoming contest from Codeforces' own list. */
export async function readContestStates(): Promise<CFContestState[]> {
  const raw = await inCodeforcesTab("/contests", scrapeContestRows, null);
  const states = raw.map(decideContestState);
  const known = states.filter((s) => s.registered !== undefined).length;
  logger.info(`Codeforces contest states: ${states.length} rows read, ${known} readable`);
  return states;
}

/**
 * scrapeContestRows runs inside codeforces.com/contests and only extracts — every
 * decision is left to decideContestState, which is an ordinary function and therefore
 * testable. Injected code cannot call anything imported (executeScript serialises it), so
 * putting the logic here would mean a second, untestable copy of it.
 *
 * The markup, measured 2026-08-27 (captured by
 * apps/api/internal/provider/codeforces/web_contests_shape_test.go):
 *
 *   <tr data-contestId="2258"> … <td class="state">Before start <span class="countdown">…
 *                                <td style="font-size:0.8em;">  ← the registration cell
 */
function scrapeContestRows(): PageResult<RawContestRow[]> {
  const all = Array.from(document.querySelectorAll("tr[data-contestid]"));
  if (all.length === 0) {
    if (document.querySelector('input[name="handleOrEmail"]')) {
      return { ok: false, error: "Sesi Codeforces di browser ini sudah habis — login ulang" };
    }
    return { ok: false, error: "Tidak ada baris contest di halaman ini" };
  }

  // /contests renders TWO tables of contest rows: current-and-upcoming first, then past
  // contests, a hundred a page. Only the first is about registration — a past row's last
  // cell holds virtual-participation links — and reading both meant a hundred rows a sync
  // arriving as states about contests whose registration state the page never stated.
  // Keyed on the table the first row belongs to rather than on the "Past contests"
  // heading, which also appears in the sidebar.
  const firstTable = all[0].closest("table");
  const rows = firstTable ? all.filter((r) => r.closest("table") === firstTable) : all;

  const out: RawContestRow[] = [];
  for (const row of rows) {
    const contestRef = (row.getAttribute("data-contestid") ?? "").trim();
    if (!contestRef) continue;

    // The registration cell is the row's LAST one. The cell before it holds the contest's
    // own countdown ("Before start"), which must not be read as the registration window.
    const cells = row.querySelectorAll("td");
    const cell = cells[cells.length - 1];
    if (!cell) continue;

    out.push({
      contestRef,
      cellText: (cell.textContent ?? "").replace(/\s+/g, " ").trim(),
      countdownTitle: (cell.querySelector("[title]")?.getAttribute("title") ?? "").trim(),
      hasRegisterLink: !!cell.querySelector('a[href*="/contestRegistration/"]'),
    });
  }
  return out.length ? { ok: true, data: out } : { ok: false, error: "Tidak ada contest yang bisa dibaca" };
}

/**
 * decideContestState turns one scraped row into a state.
 *
 * Every answer here is a phrase or an element the page actually carries. "Not registered"
 * used to be decided by elimination — neither known phrase present — and that was wrong
 * in a way that cost data: a running round, a past round and any markup change all land
 * in the same bucket, and the server deletes registrations on a `false`. So a row that
 * states nothing this function recognises now reports nothing, and the server leaves that
 * contest's record alone.
 *
 * `now` is a parameter so the conversion from Codeforces' relative countdown to an
 * absolute instant is checkable.
 */
export function decideContestState(raw: RawContestRow, now: number = Date.now()): CFContestState {
  if (/Registration completed/i.test(raw.cellText)) {
    return { contestRef: raw.contestRef, registered: true };
  }
  if (/Before registration/i.test(raw.cellText)) {
    const state: CFContestState = { contestRef: raw.contestRef, registered: false };
    // "H:MM:SS" until registration opens, where H runs past 24 ("129:08:09") — so it is a
    // duration in hours, not a clock time.
    const m = /^(\d+):([0-5]\d):([0-5]\d)$/.exec(raw.countdownTitle);
    if (m) {
      const ms = (Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000;
      state.registrationOpensAt = new Date(now + ms).toISOString();
    }
    return state;
  }
  // A link to the registration page is Codeforces offering registration, which it does
  // only while the window is open and this account is not already in.
  if (raw.hasRegisterLink) {
    return { contestRef: raw.contestRef, registered: false };
  }
  // Anything else — a running round, a finished one, a shape this parser has not met —
  // is reported as unknown rather than guessed at.
  return { contestRef: raw.contestRef };
}

export interface CFRegisterOutcome {
  registered: boolean;
  /** True when Codeforces said the account was already in before this attempt. */
  already: boolean;
}

/** Registers for a contest from the user's own browser. */
export async function registerContestInBrowser(contestId: number): Promise<CFRegisterOutcome> {
  const outcome = await inCodeforcesTab(`/contestRegistration/${contestId}`, postRegistrationForm, contestId);
  logger.info(`Codeforces registration for ${contestId}: already=${outcome.already}`);
  return outcome;
}

/**
 * postRegistrationForm runs inside the registration page.
 *
 * The form is serialised with FormData rather than rebuilt field by field. Codeforces'
 * registration form differs between an ordinary round and one with extra registration or
 * team options, and FormData sends exactly what this browser would have sent — including
 * the hidden action field and whatever the page pre-selected. Rebuilding it from a guessed
 * field list is how a registration silently registers nothing.
 *
 * Success is asserted from a positive marker, never from the absence of an error element.
 * Codeforces accepts a registration by redirecting off the form to /contests, so the
 * final URL answers it; when the reply stays on the form the page is asked again, and
 * only "you have already registered" counts as done. Treating "no error found" as success
 * is how a registration that silently registered nothing still flipped the button to
 * "Sudah terdaftar" and left the user out of the round.
 */
async function postRegistrationForm(contestId: number): Promise<PageResult<CFRegisterOutcome>> {
  const path = `/contestRegistration/${contestId}`;
  const alreadyIn = (html: string) =>
    /You have already registered|already registered for the contest|You are already registered/i.test(html);
  // Codeforces reports a rejected form in an element whose class merely contains "error".
  const rejection = (html: string) =>
    (new DOMParser().parseFromString(html, "text/html").querySelector('[class*="error"]')?.textContent ?? "").trim();

  if (alreadyIn(document.body.innerHTML)) {
    return { ok: true, data: { registered: true, already: true } };
  }
  if (document.querySelector('input[name="handleOrEmail"]')) {
    return { ok: false, error: "Sesi Codeforces di browser ini sudah habis — login ulang" };
  }

  const form = document.querySelector("form") as HTMLFormElement | null;
  if (!form) {
    return { ok: false, error: "Form registrasi tidak ditemukan — registrasi mungkin belum dibuka" };
  }
  const csrf =
    (form.querySelector('input[name="csrf_token"]') as HTMLInputElement | null)?.value ||
    (document.querySelector('meta[name="X-Csrf-Token"]') as HTMLMetaElement | null)?.content ||
    "";
  if (!csrf) return { ok: false, error: "csrf_token tidak ditemukan di form registrasi" };

  const body = new FormData(form);
  body.set("csrf_token", csrf);

  let html: string;
  let landed: string;
  try {
    const res = await fetch(`${location.origin}${path}`, {
      method: "POST",
      body,
      credentials: "include",
      redirect: "follow",
    });
    html = await res.text();
    landed = new URL(res.url, location.origin).pathname;
  } catch (e) {
    return { ok: false, error: `Gagal mengirim registrasi: ${(e as Error).message}` };
  }

  if (alreadyIn(html)) {
    return { ok: true, data: { registered: true, already: true } };
  }
  const msg = rejection(html);
  if (msg) return { ok: false, error: `Codeforces menolak registrasi: ${msg}` };
  // Off the form means accepted: Codeforces sends a successful registration to /contests.
  if (landed && landed !== path) {
    return { ok: true, data: { registered: true, already: false } };
  }

  // Still on the form. Ask the page itself rather than assume either way.
  try {
    const confirm = await fetch(`${location.origin}${path}`, { credentials: "include" });
    const confirmHtml = await confirm.text();
    if (alreadyIn(confirmHtml)) {
      return { ok: true, data: { registered: true, already: false } };
    }
  } catch {
    return { ok: false, error: "Registrasi terkirim tapi hasilnya tidak bisa dipastikan — cek halaman contest di Codeforces" };
  }
  return {
    ok: false,
    error: "Codeforces tidak mencatat registrasi — form registrasinya masih tampil setelah dikirim",
  };
}
