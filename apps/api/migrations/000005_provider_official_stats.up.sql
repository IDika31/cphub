-- Providers publish their own per-problem totals, and they legitimately differ
-- from what CPHub derives out of the submission list it can fetch: TLX reports
-- 279 problems tried where the submission feed only accounts for 247. Storing
-- the provider's own figures lets the dashboard show both, labelled by source,
-- instead of quietly disagreeing with the site it synced from.
ALTER TABLE linked_accounts
    ADD COLUMN IF NOT EXISTS total_score BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS problems_tried INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS problems_solved INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS stats_synced_at TIMESTAMPTZ;
