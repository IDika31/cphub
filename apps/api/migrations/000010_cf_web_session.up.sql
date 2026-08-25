-- Codeforces has no write API: submitting and registering only exist in the web
-- UI, so CPHub keeps a browser session per account. session_data holds the cookies
-- plus the ftaa/bfaa pair the login was tied to; password_enc holds the password
-- encrypted with AES-GCM under CRED_ENC_KEY, and only when the user opted in, so a
-- session that expires can be renewed without asking again.
ALTER TABLE linked_accounts
    ADD COLUMN IF NOT EXISTS session_data TEXT,
    ADD COLUMN IF NOT EXISTS password_enc TEXT,
    ADD COLUMN IF NOT EXISTS session_checked_at TIMESTAMPTZ;
