CREATE TABLE user_whitelist (
  user_id TEXT PRIMARY KEY,
  reason TEXT NOT NULL CHECK (reason IN ('payment_auto', 'admin_override')),
  granted_by TEXT,
  granted_at INTEGER NOT NULL,
  notes TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_user_whitelist_granted_at ON user_whitelist(granted_at);
