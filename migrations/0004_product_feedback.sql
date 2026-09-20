-- Anonymous product feedback. Deliberately stores no student identifier,
-- StudentVUE data, IP address, user agent, or account/session token.
CREATE TABLE IF NOT EXISTS product_feedback (
	id TEXT PRIMARY KEY NOT NULL,
	kind TEXT NOT NULL CHECK (kind IN ('Bug report', 'Grade question', 'Feature idea')),
	message TEXT NOT NULL,
	page_path TEXT NOT NULL,
	app_version TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'new'
		CHECK (status IN ('new', 'reviewing', 'planned', 'resolved', 'dismissed')),
	admin_note TEXT NOT NULL DEFAULT '',
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS product_feedback_created_at
	ON product_feedback(created_at DESC);

CREATE INDEX IF NOT EXISTS product_feedback_status
	ON product_feedback(status, created_at DESC);
