ALTER TABLE linked_accounts
    DROP COLUMN IF EXISTS session_data,
    DROP COLUMN IF EXISTS password_enc,
    DROP COLUMN IF EXISTS session_checked_at;
