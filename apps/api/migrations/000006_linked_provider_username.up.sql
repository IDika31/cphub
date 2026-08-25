-- A custom Judgels/TLX row identifies the INSTANCE in `handle` (the hostname)
-- and its API base in `provider_user_id`, so the account's own login name had
-- nowhere to live — and /submissions/programming?username= needs it.
ALTER TABLE linked_accounts
    ADD COLUMN IF NOT EXISTS provider_username VARCHAR(100) NOT NULL DEFAULT '';
