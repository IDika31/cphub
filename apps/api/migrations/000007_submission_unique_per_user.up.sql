-- Submission identity is per user, not global.
--
-- The original UNIQUE(provider, submission_id) meant the first account to sync a
-- given Codeforces or TLX submission owned it forever: a second user linking the
-- same handle — or any two users who happened to sync the same public submission
-- — silently got nothing, because FirstOrCreate found the other user's row and
-- treated it as "already synced".
ALTER TABLE external_submissions
    DROP CONSTRAINT IF EXISTS external_submissions_provider_submission_id_key;

-- Deduplicate before the new constraint goes on, keeping the oldest row per
-- (user, provider, submission). Rows that only collided under the old global
-- constraint cannot exist yet, so this is a no-op on current data — it is here so
-- the migration is safe to run against a database that has been repaired by hand.
DELETE FROM external_submissions es
USING external_submissions keep
WHERE es.user_id = keep.user_id
  AND es.provider = keep.provider
  AND es.submission_id = keep.submission_id
  AND es.created_at > keep.created_at;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ext_sub_user_provider_submission
    ON external_submissions (user_id, provider, submission_id);
