-- Per-synthesis log: usato per quota utente (minuti audio) e audit
CREATE TABLE synthesis_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  provider TEXT NOT NULL,           -- "groq" | "mistral"
  model TEXT NOT NULL,              -- es. "mistral-small-latest"
  audio_minutes INTEGER NOT NULL,   -- durata audio originale
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cost_usd REAL NOT NULL,           -- costo stimato in USD
  fell_back INTEGER NOT NULL DEFAULT 0,  -- 1 se fallback è scattato
  language TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (template_id) REFERENCES templates(id)
);

CREATE INDEX idx_synthesis_log_user_month
  ON synthesis_log(user_id, created_at);

-- Budget cap globale: 1 riga per mese (YYYY-MM)
CREATE TABLE budget_usage (
  month TEXT PRIMARY KEY,           -- "2026-05"
  cost_usd REAL NOT NULL DEFAULT 0,
  cap_usd REAL NOT NULL,
  updated_at INTEGER NOT NULL
);