ALTER TABLE linked_accounts
    DROP COLUMN IF EXISTS stats_synced_at,
    DROP COLUMN IF EXISTS problems_solved,
    DROP COLUMN IF EXISTS problems_tried,
    DROP COLUMN IF EXISTS total_score;
