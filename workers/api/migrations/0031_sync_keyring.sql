-- Keyring per envelope encryption (DEK avvolta).
-- Autorevole su D1 così passphrase E recovery phrase funzionano anche su un
-- nuovo dispositivo. Il keyring contiene solo la DEK cifrata (wrapped) con due
-- KEK derivate da passphrase e recovery phrase — mai la DEK in chiaro, mai le
-- KEK. Zero-knowledge mantenuto: il server non può decifrare nulla.
CREATE TABLE IF NOT EXISTS sync_keyring (
  user_id TEXT PRIMARY KEY,
  keyring_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
