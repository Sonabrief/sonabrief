import type { Env } from './env'

export async function getUserTier(userId: string, env: Env): Promise<string> {
  const row = await env.DB.prepare(
    `SELECT tier FROM licenses WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1`
  )
    .bind(userId)
    .first<{ tier: string }>()
  return row?.tier ?? 'free'
}
