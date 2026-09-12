-- Deliberately contains no email, username, grade, IP address, or portal data.
-- `student_key` is an HMAC-derived pseudonymous identifier created server-side.
CREATE TABLE IF NOT EXISTS unique_student_usage (
	student_key TEXT PRIMARY KEY NOT NULL,
	first_seen_at INTEGER NOT NULL,
	last_seen_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS unique_student_usage_last_seen
	ON unique_student_usage(last_seen_at);
