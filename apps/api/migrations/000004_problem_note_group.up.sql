-- model.Problem has carried Note and ProblemGroup for a while, but 000001 never
-- created the columns. Every INSERT/UPDATE on problems therefore failed with
--   ERROR: column "note" of relation "problems" does not exist (SQLSTATE 42703)
-- which silently emptied the whole Problemset: the editor rendered freshly
-- scraped problems from memory while nothing was ever persisted, and the
-- extension reported "Failed to save problem".

ALTER TABLE problems
    ADD COLUMN IF NOT EXISTS note TEXT NOT NULL DEFAULT '';

-- Contest/course the problem belongs to (CF contest name, TLX container).
ALTER TABLE problems
    ADD COLUMN IF NOT EXISTS problem_group VARCHAR(200) NOT NULL DEFAULT '';

-- The Problemset list filters on provider and orders by recency.
CREATE INDEX IF NOT EXISTS idx_problems_provider_created
    ON problems (provider, created_at DESC);
