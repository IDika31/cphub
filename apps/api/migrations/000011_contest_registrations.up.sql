-- Which contests this account has registered for.
--
-- It has to be recorded rather than asked, because Codeforces exposes registration
-- nowhere in its read API: contest.standings answers "Contest with id X has not
-- started" for exactly the contests where registration is still open (measured
-- 2026-08-27 against 2258/2259/2260), and there is no contest.registrants method. The
-- only other source is the /contestRegistration/<id> page, which needs a session and a
-- Cloudflare clearance per contest — far too expensive for a list of sixty.
--
-- So this table holds what CPHub knows first-hand: a registration it performed, or one
-- Codeforces reported as already existing when a registration was attempted. That makes
-- it accurate for anything done through CPHub, and self-correcting for anything done
-- elsewhere as soon as the user clicks Register once.
--
-- contest_ref matches contests.contest_ref (the provider's own id, "2257") rather than
-- contests.id, so a registration survives the contest row being resynced.
CREATE TABLE IF NOT EXISTS contest_registrations (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider      VARCHAR(20) NOT NULL,
    contest_ref   VARCHAR(50) NOT NULL,
    registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_contest_reg_user_contest UNIQUE (user_id, provider, contest_ref)
);

-- The list view asks "which of these contests is this user in", so the user comes first.
CREATE INDEX IF NOT EXISTS idx_contest_reg_user ON contest_registrations (user_id, provider);
