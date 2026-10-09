-- Replay and refresh-family revocation metadata only; no bearer credentials,
-- portal sessions, account identifiers, or student records are stored.
CREATE TABLE IF NOT EXISTS mcp_oauth_grants (
    grant_key TEXT PRIMARY KEY,
    current_token_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    revoked INTEGER NOT NULL DEFAULT 0 CHECK (revoked IN (0, 1))
);
CREATE INDEX IF NOT EXISTS idx_mcp_oauth_grants_expiry ON mcp_oauth_grants (expires_at);
