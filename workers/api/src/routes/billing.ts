import type { Env } from '../lib/env'
import { getUserFromSession } from '../lib/sessions'

interface BillingStatus {
  tier: string
  billing_cycle: string | null
  status: string
  quota_used_minutes: number
  quota_cap_minutes: number | null
  renews_at: number | null
}

const QUOTA_CAP: Record<string, number | null> = {
  free: 300,
  pro: 3000,
  unlimited: null,
}

function currentMonth(): string {
  const d = new Date()
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0')
}

export async function handleBillingStatus(req: Request, env: Env): Promise<Response> {
  const session = await getUserFromSession(req, env)
  if (!session) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
  }

  const license = await env.DB
    .prepare('SELECT tier, billing_cycle, status, renews_at FROM licenses WHERE user_id = ?')
    .bind(session.userId)
    .first<{ tier: string; billing_cycle: string | null; status: string; renews_at: number | null }>()

  const tier = license?.tier ?? 'free'
  const billing_cycle = license?.billing_cycle ?? null
  const status = license?.status ?? 'active'
  const renews_at = license?.renews_at ?? null

  const quota = await env.DB
    .prepare('SELECT synthesis_minutes FROM quota WHERE user_id = ? AND month = ?')
    .bind(session.userId, currentMonth())
    .first<{ synthesis_minutes: number }>()

  const quota_used_minutes = quota?.synthesis_minutes ?? 0
  const quota_cap_minutes = QUOTA_CAP[tier] ?? null

  const body: BillingStatus = {
    tier,
    billing_cycle,
    status,
    quota_used_minutes,
    quota_cap_minutes,
    renews_at,
  }

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
