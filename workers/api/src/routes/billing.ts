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

export async function handleBillingPortal(req: Request, env: Env): Promise<Response> {
  const session = await getUserFromSession(req, env)
  if (!session) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
  }

  const license = await env.DB
    .prepare('SELECT ls_subscription_id FROM licenses WHERE user_id = ? AND status != ?')
    .bind(session.userId, 'free')
    .first<{ ls_subscription_id: string }>()

  if (!license?.ls_subscription_id) {
    return new Response(JSON.stringify({ error: 'no_active_subscription' }), { status: 404 })
  }

  const lsRes = await fetch(
    `https://api.lemonsqueezy.com/v1/subscriptions/${license.ls_subscription_id}`,
    {
      headers: {
        'Accept': 'application/vnd.api+json',
        'Authorization': `Bearer ${env.LEMONSQUEEZY_API_KEY}`,
      },
    }
  )

  if (!lsRes.ok) {
    return new Response(JSON.stringify({ error: 'portal_fetch_failed' }), { status: 502 })
  }

  const data = await lsRes.json() as {
    data: { attributes: { urls: { customer_portal: string } } }
  }
  const portalUrl = data.data.attributes.urls.customer_portal

  return new Response(JSON.stringify({ url: portalUrl }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
