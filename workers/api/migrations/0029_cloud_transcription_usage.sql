CREATE TABLE cloud_transcription_usage (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  month TEXT NOT NULL,
  minutes_used INTEGER NOT NULL DEFAULT 0,
  extra_minutes_purchased INTEGER NOT NULL DEFAULT 0,
  budget_alert_sent_80 INTEGER NOT NULL DEFAULT 0,
  last_updated INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE UNIQUE INDEX idx_cloud_usage_user_month ON cloud_transcription_usage(user_id, month);
