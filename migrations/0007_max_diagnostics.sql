CREATE TABLE IF NOT EXISTS max_diagnostics (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  action TEXT NOT NULL,
  topic TEXT NOT NULL,
  status TEXT NOT NULL,
  question TEXT,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  first_token_ms INTEGER,
  token_frames INTEGER NOT NULL DEFAULT 0,
  output_chars INTEGER NOT NULL DEFAULT 0,
  provider TEXT,
  model TEXT,
  error_code TEXT,
  flags_json TEXT NOT NULL DEFAULT '[]',
  events_json TEXT NOT NULL DEFAULT '[]',
  report_hash TEXT NOT NULL,
  reported_reason TEXT
);
CREATE INDEX IF NOT EXISTS max_diagnostics_created ON max_diagnostics(created_at DESC);
