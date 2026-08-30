"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { fetchProblemNote, saveProblemNote } from "@/lib/api/problems";

/** How long after the last keystroke the note is written. Long enough that typing a
 *  paragraph is one request, short enough that closing the tab a second later still
 *  saved — the blur handler below covers the rest. */
const SAVE_DEBOUNCE_MS = 800;

/**
 * What the reader learned from this problem, in their own words.
 *
 * Autosaved rather than given a Save button: a note is written mid-thought, usually right
 * before switching back to the editor, and a button is exactly the step that gets skipped.
 * The problem's own row is shared by every user; this is not, which is why it has its own
 * endpoint and its own table.
 */
export default function NotesPanel({ problemId }: { problemId: string }) {
  const [body, setBody] = useState("");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "idle" | "saving" | "error">("loading");
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // What is on the server, so a save is skipped when nothing actually changed — a blur
  // right after a save would otherwise write the same body again.
  const stored = useRef("");

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    fetchProblemNote(problemId)
      .then((note) => {
        if (cancelled) return;
        setBody(note.body);
        stored.current = note.body;
        setSavedAt(note.updatedAt);
        setState("idle");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError((err as Error).message || "Gagal memuat catatan");
        setState("error");
      });
    return () => {
      cancelled = true;
      // A pending save belongs to the problem that is leaving, and its text is already
      // in state for that problem — firing it after the switch would write the old note
      // under the new problem's id.
      if (timer.current) clearTimeout(timer.current);
    };
  }, [problemId]);

  const save = useCallback(
    async (next: string) => {
      if (next.trim() === stored.current.trim()) return;
      setState("saving");
      try {
        const note = await saveProblemNote(problemId, next);
        stored.current = note.body;
        setSavedAt(note.updatedAt);
        setState("idle");
        setError("");
      } catch (err) {
        setError((err as Error).message || "Gagal menyimpan catatan");
        setState("error");
      }
    },
    [problemId],
  );

  function onChange(next: string) {
    setBody(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(next), SAVE_DEBOUNCE_MS);
  }

  return (
    <div className="h-full flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-[#a1a1aa]">
          Catatan pribadi — hanya kamu yang melihatnya.
        </span>
        <span className="ml-auto text-[11px] text-[#71717a] flex items-center gap-1.5" aria-live="polite">
          {state === "saving" && (
            <>
              <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
              Menyimpan...
            </>
          )}
          {state === "idle" && savedAt && `Tersimpan ${new Date(savedAt).toLocaleTimeString("id-ID")}`}
          {state === "idle" && !savedAt && "Belum ada catatan"}
          {state === "loading" && "Memuat..."}
        </span>
      </div>

      {error && (
        <p role="alert" className="text-[11px] text-[#f87171]">
          {error}
        </p>
      )}

      <textarea
        value={body}
        onChange={(e) => onChange(e.target.value)}
        // Whatever is pending goes now: leaving the field is the clearest signal that the
        // thought is finished, and it is also when a tab tends to get closed.
        onBlur={() => {
          if (timer.current) clearTimeout(timer.current);
          void save(body);
        }}
        disabled={state === "loading"}
        spellCheck={false}
        placeholder={"Kenapa gagal, ide yang dipakai, hal yang mau diingat…\nMisal: lupa long long di prefix sum, n sampai 2e5."}
        className="flex-1 min-h-[120px] resize-none bg-[#0f0f10] border border-[rgba(255,255,255,0.08)] rounded-[6px] p-[10px] text-[12px] leading-[1.6] text-[#e4e4e7] placeholder:text-[#52525b] focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]"
      />
    </div>
  );
}
