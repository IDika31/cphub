-- Per-account extension HMAC secret.
-- Each user signs extension traffic with their own key, so one leaked secret
-- cannot forge sync for anybody else. Requests carry X-Key-Id (the user id) so
-- the API knows which secret to verify against.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS extension_secret VARCHAR(64)
    DEFAULT encode(gen_random_bytes(32), 'hex');

UPDATE users
   SET extension_secret = encode(gen_random_bytes(32), 'hex')
 WHERE extension_secret IS NULL OR extension_secret = '';

ALTER TABLE users ALTER COLUMN extension_secret SET NOT NULL;
