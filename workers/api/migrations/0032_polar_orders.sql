-- Migration 0032: polar_orders — ricavi reali da Polar.
-- Una riga = un ordine Polar reale, importi così come riportati da Polar.
-- Source of truth dei ricavi (separata da cloud_transcription_usage, che traccia i minuti).
--
-- Idempotenza a livello ordine: PRIMARY KEY = order.id di Polar.
-- Un doppio order.created sullo stesso id → UNA riga (ON CONFLICT DO UPDATE nel webhook).
-- Importi in CENTESIMI interi (convenzione Polar), niente float.
CREATE TABLE IF NOT EXISTS polar_orders (
  id                  TEXT PRIMARY KEY,            -- order.id di Polar
  user_id             TEXT,                        -- da metadata.user_id (nullable)
  polar_customer_id   TEXT,
  subscription_id     TEXT,                        -- NULL se ordine one-time
  product_id          TEXT NOT NULL,
  tier                TEXT,                        -- pro|unlimited|extra-credits, risolto da product_id
  billing_reason      TEXT,                        -- purchase|subscription_create|subscription_cycle|...
  -- Importi in centesimi, come riportati da Polar
  currency            TEXT NOT NULL,
  amount              INTEGER NOT NULL DEFAULT 0,  -- lordo (subtotal)
  tax_amount          INTEGER NOT NULL DEFAULT 0,
  discount_amount     INTEGER NOT NULL DEFAULT 0,
  net_amount          INTEGER NOT NULL DEFAULT 0,  -- ciò che paga il cliente
  refunded_amount     INTEGER NOT NULL DEFAULT 0,  -- aggiornato da order.refunded
  status              TEXT NOT NULL DEFAULT 'paid',-- paid|refunded|partially_refunded
  -- Tracciabilità
  raw_payload         TEXT,                        -- JSON completo per riconciliazione/audit
  paid_at             INTEGER,                     -- data.created_at di Polar (ms)
  created_at          INTEGER NOT NULL,            -- quando salvato da noi (ms)
  updated_at          INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_polar_orders_user    ON polar_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_polar_orders_paid_at ON polar_orders(paid_at);
CREATE INDEX IF NOT EXISTS idx_polar_orders_sub     ON polar_orders(subscription_id);
CREATE INDEX IF NOT EXISTS idx_polar_orders_product ON polar_orders(product_id);
