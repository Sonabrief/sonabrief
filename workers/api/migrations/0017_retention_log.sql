CREATE TABLE IF NOT EXISTS retention_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ran_at INTEGER NOT NULL,
  tier TEXT NOT NULL CHECK(tier IN ('free', 'pro', 'unlimited')),
  records_deleted INTEGER NOT NULL DEFAULT 0,
  bytes_freed INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_retention_log_ran_at ON retention_log(ran_at);
CREATE INDEX IF NOT EXISTS idx_retention_log_tier ON retention_log(tier);