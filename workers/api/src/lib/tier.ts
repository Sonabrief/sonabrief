import type { Env } from './env'

export type Tier = 'free' | 'pro' | 'unlimited'

/** Tier reale dell'utente: solo Polar/licenses, ignora i comp. */
export async function getRealTier(userId: string, env: Env): Promise<string> {
  const row = await env.DB.prepare(
    `SELECT tier FROM licenses WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1`
  )
    .bind(userId)
    .first<{ tier: string }>()
  return row?.tier ?? 'free'
}

/** Comp attivo (non scaduto) dell'utente, se presente. */
export async function getActiveComp(
  userId: string,
  env: Env,
): Promise<{ tier: string; expires_at: number } | null> {
  const row = await env.DB.prepare(
    `SELECT tier, expires_at FROM comp_grants WHERE user_id = ? AND expires_at > ?`
  )
    .bind(userId, Date.now())
    .first<{ tier: string; expires_at: number }>()
  return row ?? null
}

/**
 * Tier EFFETTIVO dell'utente: comp attivo e non scaduto se presente,
 * altrimenti il tier reale (Polar/licenses, o free).
 * Check on-read della scadenza: alla scadenza l'utente torna automaticamente
 * al tier reale anche prima che il cron pulisca la riga.
 */
export async function getUserTier(userId: string, env: Env): Promise<string> {
  const comp = await getActiveComp(userId, env)
  if (comp) return comp.tier
  return getRealTier(userId, env)
}
