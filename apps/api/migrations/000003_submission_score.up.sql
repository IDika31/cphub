-- TLX grades subtask problems 0..100; the verdict alone cannot distinguish a
-- partial 70 from a 0, so the score is stored alongside it.
ALTER TABLE external_submissions
    ADD COLUMN IF NOT EXISTS score INTEGER NOT NULL DEFAULT 0;

-- Contest/container a submission belongs to (TLX container name, CF contest).
ALTER TABLE external_submissions
    ADD COLUMN IF NOT EXISTS problem_group VARCHAR(200) NOT NULL DEFAULT '';

-- TLX problem refs are JIDs, which are longer than the original 50 chars.
ALTER TABLE external_submissions
    ALTER COLUMN problem_ref TYPE VARCHAR(100);

-- The dashboard aggregates per (user, provider) and orders by submitted_at.
CREATE INDEX IF NOT EXISTS idx_ext_sub_user_provider
    ON external_submissions (user_id, provider);
CREATE INDEX IF NOT EXISTS idx_ext_sub_user_submitted
    ON external_submissions (user_id, submitted_at DESC);
-- Joining submissions to the problem library happens on (provider, problem_ref).
CREATE INDEX IF NOT EXISTS idx_problems_provider_problem
    ON problems (provider, problem_id);
