-- Sliding window sessions: track last activity for auto-extension
ALTER TABLE sessions ADD COLUMN last_seen_at INTEGER;
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);