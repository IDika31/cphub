DROP INDEX IF EXISTS idx_ext_sub_user_provider_submission;

-- Restoring the global constraint can fail if two users legitimately hold the
-- same submission, which is exactly what the up migration allows. Nothing is
-- deleted here to make it fit; fix the duplicates by hand if you need to go back.
ALTER TABLE external_submissions
    ADD CONSTRAINT external_submissions_provider_submission_id_key
    UNIQUE (provider, submission_id);
