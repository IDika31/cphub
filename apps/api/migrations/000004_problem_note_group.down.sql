DROP INDEX IF EXISTS idx_problems_provider_created;
ALTER TABLE problems DROP COLUMN IF EXISTS problem_group;
ALTER TABLE problems DROP COLUMN IF EXISTS note;
