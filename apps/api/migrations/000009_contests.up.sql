-- Contests are their own thing, not a flavour of problem: they have a phase and a
-- start time, and registering for one is an action against the contest rather
-- than against any problem inside it. contest_ref is the provider's own id ("2257"
-- on Codeforces) kept as text so a provider that numbers contests differently
-- still fits.
CREATE TABLE IF NOT EXISTS contests (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider         VARCHAR(20)  NOT NULL,
    contest_ref      VARCHAR(50)  NOT NULL,
    name             VARCHAR(300) NOT NULL,
    type             VARCHAR(20),
    phase            VARCHAR(30),
    frozen           BOOLEAN NOT NULL DEFAULT FALSE,
    start_time       TIMESTAMPTZ,
    duration_seconds BIGINT NOT NULL DEFAULT 0,
    url              VARCHAR(500),
    synced_at        TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_contests_provider_ref UNIQUE (provider, contest_ref)
);

CREATE INDEX IF NOT EXISTS idx_contests_phase_start ON contests (phase, start_time);
