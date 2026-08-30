-- The editorial, and whatever else Codeforces links beside a problem.
--
-- Not fetched: Codeforces prints these on the problem page itself, in its "Contest
-- materials" box, as links to blog entries. The statement upload already carries that
-- page (see /api/sync/cf-statement), so the links come along for free — no extra
-- request, and nothing for the server to fetch from behind Cloudflare.
--
-- Stored as a JSON array of {title, url} in text, matching how tags are stored on this
-- table. A column rather than a side table because it is one small list that is always
-- read with the problem and never queried on its own.
ALTER TABLE problems
    ADD COLUMN IF NOT EXISTS materials TEXT NOT NULL DEFAULT '[]';
