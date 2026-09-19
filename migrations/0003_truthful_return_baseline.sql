-- Migration 0002 could only preserve each existing student's latest observed
-- UTC day. All existing records are from September 2026 (Pacific daylight
-- time), so repair those rows to the product's Pacific calendar day first.
UPDATE daily_student_activity
SET activity_date = (
	SELECT strftime('%Y-%m-%d', students.last_seen_at / 1000, 'unixepoch', '-7 hours')
	FROM unique_student_usage students
	WHERE students.student_key = daily_student_activity.student_key
);

-- Add the first observed day as a second, independently proven activity point.
-- This establishes an honest all-time return when first_seen and last_seen fall
-- on different Pacific days without inventing any intervening use.
INSERT OR IGNORE INTO daily_student_activity (student_key, activity_date)
SELECT student_key, strftime('%Y-%m-%d', first_seen_at / 1000, 'unixepoch', '-7 hours')
FROM unique_student_usage;

CREATE TABLE IF NOT EXISTS analytics_metadata (
	key TEXT PRIMARY KEY NOT NULL,
	value TEXT NOT NULL
);

INSERT OR IGNORE INTO analytics_metadata (key, value)
VALUES ('complete_daily_tracking_since', date('now', '-7 hours'));
