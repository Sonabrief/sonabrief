import type { Env } from '../lib/env'
import { getUserFromSession } from '../lib/sessions'

const TABLES_WITH_USER_ID = [
  'action_items_meta',
  'sync_blobs',
  'oauth_tokens',
  'user_preferences',
  'synthesis_log',
  'unlimited_thresholds_triggered',
  'budget_usage',
  'quota',
  'licenses',
  'sessions',
  'magic_tokens',
  'signup_signals',
  'users',
]

export async function handleDeleteAccount(req: Request, env: Env): Promise<Response> {
  const session = await getUserFromSession(req, env)
  if (!session) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
  }

  const { userId } = session

  // Delete R2 blobs before removing sync_blobs metadata
  const { results: blobs } = await env.DB
    .prepare('SELECT meeting_id FROM sync_blobs WHERE user_id = ?')
    .bind(userId)
    .all<{ meeting_id: string }>()

  await Promise.all(
    (blobs ?? []).map(b => env.BLOBS.delete(`${userId}/${b.meeting_id}.sbb`))
  )

  for (const table of TABLES_WITH_USER_ID) {
    await env.DB.prepare(`DELETE FROM ${table} WHERE user_id = ?`).bind(userId).run()
  }

  return new Response(null, { status: 204 })
}
