DROP INDEX IF EXISTS idx_problems_provider_problem;
DROP INDEX IF EXISTS idx_ext_sub_user_submitted;
DROP INDEX IF EXISTS idx_ext_sub_user_provider;

ALTER TABLE external_submissions DROP COLUMN IF EXISTS problem_group;
ALTER TABLE external_submissions DROP COLUMN IF EXISTS score;
