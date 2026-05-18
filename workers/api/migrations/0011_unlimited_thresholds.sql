CREATE TABLE IF NOT EXISTS unlimited_thresholds_triggered (
  user_id TEXT NOT NULL,
  month TEXT NOT NULL,
  threshold_hours INTEGER NOT NULL,
  triggered_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, month, threshold_hours),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_unlimited_thresholds_month ON unlimited_thresholds_triggered(month);
