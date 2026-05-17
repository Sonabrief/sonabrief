CREATE TABLE sync_blobs (
  user_id TEXT NOT NULL,
  meeting_id TEXT NOT NULL,
  blob_size INTEGER NOT NULL,
  uploaded_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, meeting_id)
);
CREATE INDEX idx_sync_blobs_user ON sync_blobs(user_id);
