CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT PRIMARY KEY,
  language TEXT NOT NULL DEFAULT 'it',
  profession TEXT,
  profession_category TEXT,
  context_note TEXT,
  meeting_duration TEXT,
  client_volume TEXT,
  synthesis_mode TEXT NOT NULL DEFAULT 'standard',
  sync_enabled INTEGER NOT NULL DEFAULT 0,
  onboarded INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);