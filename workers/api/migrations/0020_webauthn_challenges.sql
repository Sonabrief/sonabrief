CREATE TABLE webauthn_challenges (
  challenge TEXT PRIMARY KEY,
  user_id TEXT,
  email TEXT,
  type TEXT NOT NULL CHECK (type IN ('registration', 'authentication')),
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_webauthn_challenges_expires ON webauthn_challenges(expires_at);
