-- When registration opens for a contest.
--
-- Codeforces publishes this only as relative text on its own contest list — a row reads
-- "Before registration <span class="countdown"><span title="129:08:09">5 days</span>" —
-- and exposes it in no API field. The extension reads that countdown in the user's
-- browser and converts it to an absolute instant before sending it here.
--
-- Stored absolute rather than as a "registration open" flag on purpose: a flag would be
-- wrong the moment the window opened, while an instant stays correct without another
-- sync. NULL means unknown, which the UI treats as "offer the button and let Codeforces
-- decide" — the same safe direction the rest of this feature takes.
--
-- This is a property of the contest, not of a viewer, so it belongs here rather than in
-- contest_registrations.
ALTER TABLE contests
    ADD COLUMN IF NOT EXISTS registration_opens_at TIMESTAMPTZ;
