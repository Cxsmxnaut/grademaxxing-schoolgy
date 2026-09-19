-- One row per protected student key per UTC day. No raw identity, email,
-- grade, IP address, district record, or request payload is stored.
CREATE TABLE IF NOT EXISTS daily_student_activity (
	student_key TEXT NOT NULL,
	activity_date TEXT NOT NULL,
	PRIMARY KEY (student_key, activity_date)
);

CREATE INDEX IF NOT EXISTS daily_student_activity_date
	ON daily_student_activity(activity_date);

-- Seed one truthful activity point for students observed before this migration.
INSERT OR IGNORE INTO daily_student_activity (student_key, activity_date)
SELECT student_key, strftime('%Y-%m-%d', last_seen_at / 1000, 'unixepoch')
FROM unique_student_usage;
