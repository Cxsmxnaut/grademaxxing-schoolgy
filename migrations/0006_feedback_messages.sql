-- Append-only messages for feedback conversations. Existing reports and replies
-- remain in product_feedback and are included when a conversation is read.
CREATE TABLE IF NOT EXISTS product_feedback_messages (
	id TEXT PRIMARY KEY NOT NULL,
	feedback_id TEXT NOT NULL REFERENCES product_feedback(id) ON DELETE CASCADE,
	sender TEXT NOT NULL CHECK (sender IN ('student', 'admin')),
	message TEXT NOT NULL,
	created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS product_feedback_messages_thread
	ON product_feedback_messages(feedback_id, created_at);
