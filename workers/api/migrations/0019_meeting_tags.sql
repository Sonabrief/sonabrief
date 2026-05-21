CREATE TABLE IF NOT EXISTS meeting_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, name),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS meeting_tag_assignments (
  meeting_id TEXT NOT NULL,
  tag_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  PRIMARY KEY (meeting_id, tag_id),
  FOREIGN KEY (tag_id) REFERENCES meeting_tags(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_meeting_tags_user ON meeting_tags(user_id);
CREATE INDEX IF NOT EXISTS idx_tag_assignments_meeting ON meeting_tag_assignments(meeting_id);
CREATE INDEX IF NOT EXISTS idx_tag_assignments_user ON meeting_tag_assignments(user_id);