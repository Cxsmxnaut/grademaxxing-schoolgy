-- Referral identities are intentionally isolated from StudentVUE usage records.
-- They exist only to operate the invite-only referral program.
CREATE TABLE IF NOT EXISTS referral_partners (
	id TEXT PRIMARY KEY NOT NULL,
	code TEXT UNIQUE NOT NULL,
	first_name TEXT NOT NULL,
	last_name TEXT NOT NULL,
	email TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	active INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS referral_partners_email
	ON referral_partners(lower(email));

CREATE TABLE IF NOT EXISTS referral_attributions (
	partner_id TEXT NOT NULL,
	student_key TEXT PRIMARY KEY NOT NULL,
	created_at INTEGER NOT NULL,
	FOREIGN KEY (partner_id) REFERENCES referral_partners(id)
);

CREATE INDEX IF NOT EXISTS referral_attributions_partner
	ON referral_attributions(partner_id, created_at DESC);
