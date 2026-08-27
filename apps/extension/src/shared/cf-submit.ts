/**
 * Submitting, done in the user's own browser. See cf-tab.ts for why that is where it has
 * to happen; this file is only the submit form itself.
 */

import { inCodeforcesTab, type PageResult } from "./cf-tab";
import { logger } from "./logger";

export interface CFSubmitRequest {
  contestId: number;
  problemIndex: string;
  /** A numeric programTypeId, or a name like "cpp" / "Python 3" to resolve. */
  language: string;
  source: string;
}

export interface CFLanguage {
  id: string;
  name: string;
}

/**
 * Aliases from what CPHub's editor calls a language to what Codeforces prints in its
 * dropdown.
 *
 * This mirrors cfLanguageAliases in apps/api/internal/handler/cf_web_session.go. Two
 * copies is a real cost, accepted because the resolution has to happen wherever the
 * submit happens, and the page's own option text is the only stable key —
 * programTypeId is renumbered whenever a compiler is updated.
 *
 * Codeforces writes its C++ entries as "GNU G++20 13.2" — G++, not C++ — so the
 * needles lead with that spelling and keep "C++" for the Clang and MSVC entries.
 */
const LANGUAGE_ALIASES: Record<string, string[]> = {
  cpp23: ["G++23", "C++23"],
  cpp20: ["G++20", "C++20"],
  cpp17: ["G++17", "C++17"],
  cpp14: ["G++14", "C++14"],
  cpp: ["G++20", "G++17", "G++23", "C++"],
  c: ["GCC C11", "GNU GCC C"],
  python3: ["Python 3", "PyPy 3"],
  python: ["Python 3", "PyPy 3"],
  pypy3: ["PyPy 3"],
  java: ["Java 21", "Java 17", "Java"],
  java21: ["Java 21"],
  java17: ["Java 17"],
  nodejs: ["Node.js", "JavaScript"],
  js: ["Node.js", "JavaScript"],
  kotlin: ["Kotlin"],
  go: ["Go"],
  rust: ["Rust"],
  csharp: ["C#"],
};

/** Reads the submit form's language dropdown. Doubles as a session check: the
 *  dropdown only renders for a signed-in user. */
export async function fetchCFLanguages(contestId: number): Promise<CFLanguage[]> {
  return inCodeforcesTab(`/contest/${contestId}/submit`, readLanguages, null);
}

function readLanguages(): PageResult<CFLanguage[]> {
  const select = document.querySelector('select[name="programTypeId"]') as HTMLSelectElement | null;
  if (!select) {
    if (document.querySelector('input[name="handleOrEmail"]')) {
      return { ok: false, error: "Sesi Codeforces di browser ini sudah habis — login ulang" };
    }
    return { ok: false, error: "Form submit tidak ditemukan di halaman ini" };
  }
  const out: CFLanguage[] = [];
  for (const opt of Array.from(select.options)) {
    const name = (opt.textContent ?? "").trim();
    if (name) out.push({ id: opt.value, name });
  }
  return out.length ? { ok: true, data: out } : { ok: false, error: "Dropdown bahasa kosong" };
}

export interface CFSubmitOutcome {
  submitted: boolean;
  handle: string;
}

export async function submitCF(req: CFSubmitRequest): Promise<CFSubmitOutcome> {
  const outcome = await inCodeforcesTab(`/contest/${req.contestId}/submit`, postSubmitForm, {
    ...req,
    aliases: LANGUAGE_ALIASES,
  });
  logger.info(`Codeforces submit accepted for ${req.contestId}${req.problemIndex}`);
  return outcome;
}

/**
 * postSubmitForm runs inside the submit page. Self-contained by necessity: nothing in
 * this module is in scope once executeScript has serialised it.
 *
 * The form is replayed rather than driven through the page's own submit handler, so
 * the reply can be read instead of navigated away from.
 */
async function postSubmitForm(
  arg: CFSubmitRequest & { aliases: Record<string, string[]> },
): Promise<PageResult<CFSubmitOutcome>> {
  const form = document.querySelector('form.submit-form, form[enctype="multipart/form-data"]') as HTMLFormElement | null;
  const select = document.querySelector('select[name="programTypeId"]') as HTMLSelectElement | null;
  if (!form || !select) {
    if (document.querySelector('input[name="handleOrEmail"]')) {
      return { ok: false, error: "Sesi Codeforces di browser ini sudah habis — login ulang" };
    }
    return { ok: false, error: "Form submit tidak ditemukan — Codeforces mungkin mengubah halamannya" };
  }

  // --- resolve the language against the page's own option text -----------------
  const options = Array.from(select.options).map((o) => ({ id: o.value, name: (o.textContent ?? "").trim() }));
  let programTypeId = "";
  const want = (arg.language || "").trim();
  if (!want) return { ok: false, error: "Bahasa belum dipilih" };
  if (/^\d+$/.test(want)) {
    programTypeId = options.some((o) => o.id === want) ? want : "";
    if (!programTypeId) return { ok: false, error: `programTypeId ${want} tidak ada di daftar bahasa akun ini` };
  } else {
    for (const needle of arg.aliases[want.toLowerCase()] ?? []) {
      const hit = options.find((o) => o.name.includes(needle));
      if (hit) { programTypeId = hit.id; break; }
    }
    if (!programTypeId) {
      const hit = options.find((o) => o.name.toLowerCase().includes(want.toLowerCase()));
      if (hit) programTypeId = hit.id;
    }
    if (!programTypeId) return { ok: false, error: `Bahasa "${want}" tidak cocok dengan opsi Codeforces mana pun` };
  }

  // --- replay the form, keeping every hidden field the page put there ----------
  const csrf =
    (form.querySelector('input[name="csrf_token"]') as HTMLInputElement | null)?.value ||
    (document.querySelector('meta[name="X-Csrf-Token"]') as HTMLMetaElement | null)?.content ||
    "";
  if (!csrf) return { ok: false, error: "csrf_token tidak ditemukan di form submit" };

  const body = new FormData();
  for (const input of Array.from(form.querySelectorAll('input[type="hidden"]'))) {
    const el = input as HTMLInputElement;
    if (el.name) body.set(el.name, el.value);
  }
  body.set("csrf_token", csrf);
  body.set("action", "submitSolutionFormSubmitted");
  body.set("submittedProblemIndex", arg.problemIndex.toUpperCase());
  body.set("programTypeId", programTypeId);
  body.set("contestId", String(arg.contestId));
  body.set("source", arg.source);
  body.set("tabSize", "4");
  body.set("sourceCodeConfirmed", "true");

  const handle =
    (document.querySelector('.enter-or-register-box a[href^="/profile/"]') as HTMLAnchorElement | null)
      ?.getAttribute("href")?.split("/")[2] ?? "";

  let html: string;
  try {
    const res = await fetch(
      `${location.origin}/contest/${arg.contestId}/submit?csrf_token=${encodeURIComponent(csrf)}`,
      { method: "POST", body, credentials: "include", redirect: "follow" },
    );
    html = await res.text();
  } catch (e) {
    return { ok: false, error: `Gagal mengirim submit: ${(e as Error).message}` };
  }

  // An error element is authoritative: it carries "You have submitted exactly the
  // same code before" and every compile-time rejection. Codeforces puts it in an
  // element whose class merely CONTAINS "error", and it may be a div or a span.
  const doc = new DOMParser().parseFromString(html, "text/html");
  const msg = (doc.querySelector('[class*="error"]')?.textContent ?? "").trim();
  if (msg) return { ok: false, error: `Codeforces menolak submit: ${msg}` };

  const accepted =
    html.includes("status-frame-datatable") ||
    html.includes('id="submissions"') ||
    /\/contest\/\d+\/my/.test(html);
  if (!accepted) {
    return { ok: false, error: "Hasil submit tidak bisa dipastikan — balasan Codeforces tidak dikenali" };
  }
  return { ok: true, data: { submitted: true, handle } };
}
