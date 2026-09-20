-- Reply access uses a random browser-held receipt. Only its SHA-256 hash is
-- stored, so the database cannot reveal the credential used to read a reply.
ALTER TABLE product_feedback ADD COLUMN reply_token_hash TEXT;
ALTER TABLE product_feedback ADD COLUMN admin_reply TEXT NOT NULL DEFAULT '';
ALTER TABLE product_feedback ADD COLUMN replied_at INTEGER;
