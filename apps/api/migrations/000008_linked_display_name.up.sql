-- A self-hosted Judgels instance is identified by its hostname, which is what the
-- UI had to show: "tlx-cpc.compfest.id". The extension now lets the user name the
-- instance ("COMPFEST CPC"), and that name is only a label — handle stays the
-- host, because every lookup and generated URL keys off it.
ALTER TABLE linked_accounts
    ADD COLUMN IF NOT EXISTS display_name VARCHAR(100) NOT NULL DEFAULT '';
