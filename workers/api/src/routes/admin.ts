import type { Env } from '../lib/env'
import { getUserFromSession } from '../lib/sessions'
import { corsHeaders } from '../lib/cors'
import { addUserToWhitelist, removeUserFromWhitelist } from '../lib/antiabuse'

const FOUNDER_EMAIL = 'sonabrief.app@gmail.com'

async function requireFounder(req: Request, env: Env): Promise<{ ok: true; userId: string } | { ok: false; response: Response }> {
  const cors = corsHeaders(req, env)
  const session = await getUserFromSession(req, env)
  if (!session) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      }),
    }
  }
  const user = await env.DB
    .prepare('SELECT email FROM users WHERE id = ?')
    .bind(session.userId)
    .first<{ email: string }>()
  if (!user || user.email !== FOUNDER_EMAIL) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: "forbidden" }), {
        status: 403,
        headers: { ...cors, "Content-Type": "application/json" },
      }),
    }
  }
  return { ok: true, userId: session.userId }
}

function currentMonth(): string {
  const d = new Date()
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0')
}

const MRR_MAP: Record<string, number> = {
  'pro-monthly': 9,
  'pro-annual': 89 / 12,
  'unlimited-monthly': 19,
  'unlimited-annual': 189 / 12,
}

export async function handleAdminStats(req: Request, env: Env): Promise<Response> {
  const auth = await requireFounder(req, env)
  if (!auth.ok) return auth.response
  const cors = corsHeaders(req, env)

  const month = currentMonth()
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000

  // 1. Utenti totali
  const totalUsers = await env.DB
    .prepare('SELECT COUNT(*) as cnt FROM users')
    .first<{ cnt: number }>()

  // 2. Utenti per tier
  const tierCounts = await env.DB
    .prepare(`
      SELECT tier, COUNT(*) as cnt FROM licenses
      WHERE status = 'active'
      GROUP BY tier
    `)
    .all<{ tier: string; cnt: number }>()

  // 3. MRR approssimativo
  const activeLicenses = await env.DB
    .prepare(`SELECT tier, billing_cycle FROM licenses WHERE status = 'active'`)
    .all<{ tier: string; billing_cycle: string | null }>()

  let mrr = 0
  for (const l of activeLicenses.results) {
    const key = `${l.tier}-${l.billing_cycle ?? 'monthly'}`
    mrr += MRR_MAP[key] ?? 0
  }

  // 4. Spesa LLM mese corrente
  const budget = await env.DB
    .prepare('SELECT cost_usd, cap_usd FROM budget_usage WHERE month = ?')
    .bind(month)
    .first<{ cost_usd: number; cap_usd: number }>()

  // 5. Sintesi ultimi 30 giorni
  const synthStats = await env.DB
    .prepare(`
      SELECT
        COUNT(*) as total,
        SUM(audio_minutes) as total_minutes,
        SUM(cost_usd) as total_cost,
        SUM(fell_back) as total_fallbacks,
        provider,
        COUNT(*) as provider_count
      FROM synthesis_log
      WHERE created_at > ?
      GROUP BY provider
    `)
    .bind(thirtyDaysAgo)
    .all<{ total: number; total_minutes: number; total_cost: number; total_fallbacks: number; provider: string; provider_count: number }>()

  // 6. Top 10 utenti per minuti nel mese
  const topUsers = await env.DB
    .prepare(`
      SELECT u.email, q.synthesis_minutes, q.synthesis_count
      FROM quota q
      JOIN users u ON u.id = q.user_id
      WHERE q.month = ?
      ORDER BY q.synthesis_minutes DESC
      LIMIT 10
    `)
    .bind(month)
    .all<{ email: string; synthesis_minutes: number; synthesis_count: number }>()

  // 7. Ultimi 20 signup
  const recentSignups = await env.DB
    .prepare(`
      SELECT u.email, u.created_at, l.tier, s.flagged, s.flag_reason
      FROM users u
      LEFT JOIN licenses l ON l.user_id = u.id
      LEFT JOIN signup_signals s ON s.user_id = u.id
      ORDER BY u.created_at DESC
      LIMIT 20
    `)
    .all<{ email: string; created_at: number; tier: string | null; flagged: number | null; flag_reason: string | null }>()

  // 8. Account flaggati
  const flaggedAccounts = await env.DB
    .prepare(`
      SELECT u.email, s.flagged, s.flag_reason, s.created_at
      FROM signup_signals s
      JOIN users u ON u.id = s.user_id
      WHERE s.flagged = 1
      ORDER BY s.created_at DESC
      LIMIT 20
    `)
    .all<{ email: string; flagged: number; flag_reason: string; created_at: number }>()

  // 9. Soglie Pro Unlimited triggerate
  const thresholds = await env.DB
    .prepare(`
      SELECT u.email, t.threshold_hours, t.triggered_at
      FROM unlimited_thresholds_triggered t
      JOIN users u ON u.id = t.user_id
      WHERE t.month = ?
      ORDER BY t.triggered_at DESC
    `)
    .bind(month)
    .all<{ email: string; threshold_hours: number; triggered_at: number }>()

  // 10. Ultimi 20 webhook
  const webhooks = await env.DB
    .prepare(`
      SELECT event_id, event_name, processed_at
      FROM webhook_events
      ORDER BY processed_at DESC
      LIMIT 20
    `)
    .all<{ event_id: string; event_name: string; processed_at: number }>()

  // 11. Subscription per status
  const subStatus = await env.DB
    .prepare(`
      SELECT status, COUNT(*) as cnt
      FROM licenses
      GROUP BY status
    `)
    .all<{ status: string; cnt: number }>()

  return new Response(JSON.stringify({
    overview: {
      total_users: totalUsers?.cnt ?? 0,
      mrr_eur: Math.round(mrr * 100) / 100,
      budget_used_usd: budget?.cost_usd ?? 0,
      budget_cap_usd: budget?.cap_usd ?? 50,
    },
    tiers: tierCounts.results,
    synth_by_provider: synthStats.results,
    top_users: topUsers.results,
    recent_signups: recentSignups.results,
    flagged_accounts: flaggedAccounts.results,
    thresholds_triggered: thresholds.results,
    recent_webhooks: webhooks.results,
    subscription_status: subStatus.results,
  }), {
    status: 200,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

export async function handleAdminWhitelistList(req: Request, env: Env): Promise<Response> {
  const auth = await requireFounder(req, env)
  if (!auth.ok) return auth.response
  const cors = corsHeaders(req, env)

  const rows = await env.DB.prepare(`
    SELECT w.user_id, w.reason, w.granted_by, w.granted_at, w.notes, u.email
    FROM user_whitelist w
    LEFT JOIN users u ON u.id = w.user_id
    ORDER BY w.granted_at DESC
    LIMIT 200
  `).all()

  return new Response(JSON.stringify({ ok: true, entries: rows.results }), {
    headers: { ...cors, "Content-Type": "application/json" },
  })
}

export async function handleAdminWhitelistAdd(req: Request, env: Env): Promise<Response> {
  const auth = await requireFounder(req, env)
  if (!auth.ok) return auth.response
  const cors = corsHeaders(req, env)

  const body = await req.json().catch(() => null) as { email?: string; notes?: string } | null
  const email = body?.email?.trim().toLowerCase()
  if (!email) {
    return new Response(JSON.stringify({ ok: false, error: "email_required" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    })
  }

  const user = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<{ id: string }>()
  if (!user) {
    return new Response(JSON.stringify({ ok: false, error: "user_not_found" }), {
      status: 404,
      headers: { ...cors, "Content-Type": "application/json" },
    })
  }

  await addUserToWhitelist(user.id, "admin_override", env, {
    grantedBy: auth.userId,
    notes: body?.notes,
  })

  return new Response(JSON.stringify({ ok: true, userId: user.id }), {
    headers: { ...cors, "Content-Type": "application/json" },
  })
}

export async function handleAdminWhitelistRemove(req: Request, env: Env): Promise<Response> {
  const auth = await requireFounder(req, env)
  if (!auth.ok) return auth.response
  const cors = corsHeaders(req, env)

  const url = new URL(req.url)
  const userId = url.searchParams.get("user_id")
  if (!userId) {
    return new Response(JSON.stringify({ ok: false, error: "user_id_required" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    })
  }

  await removeUserFromWhitelist(userId, env)

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...cors, "Content-Type": "application/json" },
  })
}