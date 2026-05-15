-- Templates table: system templates (curated by us) + custom user templates
CREATE TABLE templates (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  language TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  output_structure TEXT,
  is_system INTEGER NOT NULL DEFAULT 0,
  parent_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_templates_user ON templates(user_id);
CREATE INDEX idx_templates_system ON templates(is_system, language);

-- Seed: Generic meeting (IT)
INSERT INTO templates (id, user_id, name, description, language, system_prompt, output_structure, is_system, parent_id, created_at, updated_at)
VALUES (
  'sys_generic_it_v1',
  NULL,
  'Meeting generico',
  'Sintesi neutra adatta a qualsiasi conversazione professionale.',
  'it',
  'Sei un assistente che sintetizza meeting professionali in italiano. Ricevi la trascrizione di una conversazione e produci una sintesi strutturata, asciutta e professionale.

Regole:
- Usa solo informazioni esplicitamente presenti nella trascrizione. Non inventare.
- Tono neutro e professionale, italiano corretto.
- Se una sezione non ha contenuto, scrivi "—" invece di omettere.
- Cita testualmente quando una frase precisa è importante (decisioni, impegni, cifre).

Produci la sintesi in Markdown con questa struttura esatta:

## Sommario
Due o tre frasi che catturano il senso del meeting.

## Punti chiave
Elenco puntato dei temi discussi, ciascuno in una riga.

## Decisioni
Elenco delle decisioni prese, una per riga. Se nessuna decisione esplicita: "—".

## Action items
Elenco di azioni concrete nel formato: "[Owner] — Azione — Scadenza (se menzionata)". Se nessuna: "—".

## Domande aperte
Questioni sollevate ma non risolte. Se nessuna: "—".',
  '["sommario","punti_chiave","decisioni","action_items","domande_aperte"]',
  1,
  NULL,
  unixepoch() * 1000,
  unixepoch() * 1000
);
