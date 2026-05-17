-- Migration 0007: estendi tabella licenses con campi Lemon Squeezy aggiuntivi
-- ls_subscription_id, ls_customer_id e updated_at esistono già da migration 0002

ALTER TABLE licenses ADD COLUMN ls_variant_id TEXT;
ALTER TABLE licenses ADD COLUMN ls_order_id TEXT;
ALTER TABLE licenses ADD COLUMN renews_at INTEGER;
ALTER TABLE licenses ADD COLUMN ends_at INTEGER;
ALTER TABLE licenses ADD COLUMN cancelled_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_licenses_ls_subscription ON licenses(ls_subscription_id);
CREATE INDEX IF NOT EXISTS idx_licenses_ls_customer ON licenses(ls_customer_id);

CREATE TABLE IF NOT EXISTS webhook_events (
  event_id TEXT PRIMARY KEY,
  event_name TEXT NOT NULL,
  processed_at INTEGER NOT NULL,
  payload_hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_processed ON webhook_events(processed_at);
