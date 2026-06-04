-- Migration 0033: comp_grants — assegnazioni manuali di tier (comp) dal founder.
-- Un comp è un tier (pro|unlimited) regalato a un utente, COMPLETAMENTE separato
-- dall'abbonamento Polar. NON crea subscription, NON tocca licenses/polar_orders,
-- NON entra in nessuna metrica di revenue/MRR.
--
-- Risoluzione tier effettivo (vedi lib/tier.ts): se esiste un comp attivo e non
-- scaduto -> quel tier; altrimenti il tier reale (licenses, o free).
-- Alla scadenza l'utente torna automaticamente al tier reale (check on-read +
-- cron giornaliero che marca scaduti i comp).
--
-- Un comp attivo per utente: PRIMARY KEY = user_id, l'assegnazione fa UPSERT.
CREATE TABLE IF NOT EXISTS comp_grants (
  user_id     TEXT PRIMARY KEY,
  tier        TEXT NOT NULL CHECK (tier IN ('pro', 'unlimited')),
  expires_at  INTEGER NOT NULL,          -- ms epoch; oltre questa data il comp non vale più
  granted_by  TEXT,                       -- user_id del founder che ha assegnato
  notes       TEXT,
  created_at  INTEGER NOT NULL,           -- ms epoch
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_comp_grants_expires_at ON comp_grants(expires_at);

-- Log di audit: ogni assegnazione/revoca/scadenza lascia una riga immutabile.
-- Append-only, non si aggiorna mai: serve a ricostruire chi ha dato cosa a chi e quando.
CREATE TABLE IF NOT EXISTS comp_grants_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL,
  email       TEXT,                       -- snapshot email al momento dell'azione (audit)
  action      TEXT NOT NULL CHECK (action IN ('grant', 'revoke', 'expire')),
  tier        TEXT,                        -- tier coinvolto (NULL per revoke senza dettagli)
  expires_at  INTEGER,
  actor       TEXT,                        -- user_id del founder (NULL per azioni del cron)
  notes       TEXT,
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_comp_grants_log_user    ON comp_grants_log(user_id);
CREATE INDEX IF NOT EXISTS idx_comp_grants_log_created ON comp_grants_log(created_at);
