-- Migration 0010: anti-abuse signals e IP throttling

CREATE TABLE IF NOT EXISTS signup_signals (
  user_id TEXT PRIMARY KEY,
  ip_hash TEXT NOT NULL,
  user_agent TEXT,
  accept_language TEXT,
  timezone TEXT,
  screen_resolution TEXT,
  fingerprint_hash TEXT NOT NULL,
  flagged INTEGER NOT NULL DEFAULT 0,
  flag_reason TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_signup_signals_ip ON signup_signals(ip_hash);
CREATE INDEX IF NOT EXISTS idx_signup_signals_fingerprint ON signup_signals(fingerprint_hash);
CREATE INDEX IF NOT EXISTS idx_signup_signals_flagged ON signup_signals(flagged);

CREATE TABLE IF NOT EXISTS ip_throttle (
  ip_hash TEXT PRIMARY KEY,
  count_24h INTEGER NOT NULL DEFAULT 0,
  count_month INTEGER NOT NULL DEFAULT 0,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  window_24h_start INTEGER NOT NULL,
  window_month_start INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ip_throttle_last_seen ON ip_throttle(last_seen_at);
