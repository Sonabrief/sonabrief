-- Migration 0009: rende template_id nullable, aggiunge tier e mode
-- SQLite non supporta ALTER COLUMN; bisogna ricreare la tabella.

CREATE TABLE synthesis_log_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  template_id TEXT,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  audio_minutes INTEGER NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_usd REAL NOT NULL DEFAULT 0,
  fell_back INTEGER NOT NULL DEFAULT 0,
  language TEXT,
  created_at INTEGER NOT NULL,
  tier TEXT,
  mode TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE SET NULL
);

INSERT INTO synthesis_log_new (id, user_id, template_id, provider, model, audio_minutes, input_tokens, output_tokens, cost_usd, fell_back, language, created_at)
SELECT id, user_id, template_id, provider, model, audio_minutes, input_tokens, output_tokens, cost_usd, fell_back, language, created_at
FROM synthesis_log;

DROP TABLE synthesis_log;
ALTER TABLE synthesis_log_new RENAME TO synthesis_log;

CREATE INDEX IF NOT EXISTS idx_synthesis_log_user ON synthesis_log(user_id);
CREATE INDEX IF NOT EXISTS idx_synthesis_log_created ON synthesis_log(created_at);
CREATE INDEX IF NOT EXISTS idx_synthesis_log_provider ON synthesis_log(provider, created_at);
CREATE INDEX IF NOT EXISTS idx_synthesis_log_tier ON synthesis_log(tier, created_at);
