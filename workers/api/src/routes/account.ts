import type { Env } from '../lib/env'
import { getUserFromSession } from '../lib/sessions'

// Tabelle con colonna `user_id` diretta, in ordine FK-safe (figli prima dei padri).
// `users` NON è qui: usa colonna `id` e va cancellata per ultima a parte.
// Escluse di proposito (nessun dato utente): ip_throttle (ip_hash), budget_usage
// (budget globale per mese), webhook_events (eventi billing), retention_log (log aggregato).
const TABLES_WITH_USER_ID = [
  // tag: assignments prima di meeting_tags (FK ON DELETE CASCADE)
  'meeting_tag_assignments',
  'meeting_tags',
  // sync
  'sync_blobs',
  'sync_keyring',
  // auth / credenziali
  'oauth_tokens',
  'webauthn_credentials',
  'webauthn_challenges',
  'sessions',
  'magic_tokens',
  // preferenze / quota / usage
  'user_preferences',
  'synthesis_log',
  'cloud_transcription_usage',
  'unlimited_thresholds_triggered',
  'quota',
  'licenses',
  // antiabuse / whitelist
  'signup_signals',
  'user_whitelist',
]

export async function handleDeleteAccount(req: Request, env: Env): Promise<Response> {
  const session = await getUserFromSession(req, env)
  if (!session) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
  }

  const { userId } = session

  // Leggi la lista dei blob R2 PRIMA di cancellare i metadati sync_blobs.
  const { results: blobs } = await env.DB
    .prepare('SELECT meeting_id FROM sync_blobs WHERE user_id = ?')
    .bind(userId)
    .all<{ meeting_id: string }>()

  // Cancellazione GDPR Art. 17 atomica: tutte le DELETE in un'unica transazione
  // D1 (batch). Se una fallisce, l'intero batch viene annullato — niente
  // cancellazione parziale. La fonte di verità (riga users) sparisce solo se
  // TUTTI i dati collegati sono stati rimossi.
  const statements = [
    ...TABLES_WITH_USER_ID.map(table =>
      env.DB.prepare(`DELETE FROM ${table} WHERE user_id = ?`).bind(userId)
    ),
    // Template custom (is_system=1 = curati da noi, da preservare).
    // synthesis_log.template_id ha ON DELETE SET NULL, già gestito nel batch.
    env.DB.prepare('DELETE FROM templates WHERE user_id = ? AND is_system = 0').bind(userId),
    // users usa colonna `id` (non user_id) ed è padre di tutto: per ultima.
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId),
  ]
  await env.DB.batch(statements)

  // I blob R2 NON sono nella transazione D1. Cancellarli DOPO il commit, in
  // best-effort: l'account è già rimosso da D1 (fonte di verità), quindi un
  // errore R2 lascia solo blob orfani — lo logghiamo ma NON lo propaghiamo,
  // così la cancellazione GDPR risponde comunque 204.
  try {
    await Promise.all(
      (blobs ?? []).map(b => env.BLOBS.delete(`${userId}/${b.meeting_id}.sbb`))
    )
  } catch (err) {
    console.error('[account] R2 blob cleanup failed after account deletion:', userId, err)
  }

  return new Response(null, { status: 204 })
}
