import type { Env } from '../lib/env'
import { getUserFromSession } from '../lib/sessions'
import { corsHeaders } from '../lib/cors'
import { addUserToWhitelist, removeUserFromWhitelist } from '../lib/antiabuse'

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
  // Fail-safe: se FOUNDER_EMAIL non è iniettato, env.FOUNDER_EMAIL è undefined
  // e nessuna email match → accesso admin negato (fail closed).
  if (!user || user.email !== env.FOUNDER_EMAIL) {
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
  const now = new Date()
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const startOfMonthMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  const startOfNextMonthMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)

  // 1. Utenti totali
  const totalUsers = await env.DB
    .prepare('SELECT COUNT(*) as cnt FROM users')
    .first<{ cnt: number }>()

  // 2. Utenti per tier (inclusi free senza licenza)
  const tierCounts = await env.DB
    .prepare(`
      SELECT COALESCE(l.tier, 'free') as tier, COUNT(*) as cnt
      FROM users u
      LEFT JOIN licenses l ON l.user_id = u.id AND l.status = 'active'
      GROUP BY COALESCE(l.tier, 'free')
      ORDER BY cnt DESC
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

  // 10. Ultimi 20 webhook (tutti i provider)
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

  // 12. Cloud Veloce — aggregati mese corrente
  const cloudVeloceAgg = await env.DB
    .prepare(`
      SELECT
        COALESCE(SUM(minutes_used), 0) as total_minutes,
        COALESCE(SUM(extra_minutes_purchased), 0) as total_extra_minutes,
        COUNT(DISTINCT CASE WHEN minutes_used > 0 THEN user_id END) as unique_users,
        MAX(budget_alert_sent_80) as alert_sent
      FROM cloud_transcription_usage
      WHERE month = ?
    `)
    .bind(month)
    .first<{ total_minutes: number; total_extra_minutes: number; unique_users: number; alert_sent: number }>()

  // 13. Cloud Veloce — top 5 utenti
  const cloudVeloceTopUsers = await env.DB
    .prepare(`
      SELECT u.email, c.minutes_used
      FROM cloud_transcription_usage c
      JOIN users u ON u.id = c.user_id
      WHERE c.month = ?
      ORDER BY c.minutes_used DESC
      LIMIT 5
    `)
    .bind(month)
    .all<{ email: string; minutes_used: number }>()

  // 14. Cloud Veloce — distribuzione utenti per fascia
  const cloudVeloceDist = await env.DB
    .prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN minutes_used < 60 THEN 1 ELSE 0 END), 0) as d_0_1h,
        COALESCE(SUM(CASE WHEN minutes_used >= 60 AND minutes_used < 180 THEN 1 ELSE 0 END), 0) as d_1_3h,
        COALESCE(SUM(CASE WHEN minutes_used >= 180 AND minutes_used < 300 THEN 1 ELSE 0 END), 0) as d_3_5h,
        COALESCE(SUM(CASE WHEN minutes_used >= 300 THEN 1 ELSE 0 END), 0) as d_5h_plus
      FROM cloud_transcription_usage
      WHERE month = ?
    `)
    .bind(month)
    .first<{ d_0_1h: number; d_1_3h: number; d_3_5h: number; d_5h_plus: number }>()

  // 15. Extra credits — ordini Polar via webhook_events mese corrente
  const extraCreditsOrders = await env.DB
    .prepare(`
      SELECT COUNT(*) as cnt
      FROM webhook_events
      WHERE event_name = 'order.created'
      AND processed_at >= ?
      AND processed_at < ?
    `)
    .bind(startOfMonthMs, startOfNextMonthMs)
    .first<{ cnt: number }>()

  // 15b. Extra credits — minuti acquistati per tier (per stima ricavo)
  const extraMinsByTier = await env.DB
    .prepare(`
      SELECT
        COALESCE(l.tier, 'free') as tier,
        COALESCE(SUM(c.extra_minutes_purchased), 0) as extra_minutes,
        COUNT(DISTINCT c.user_id) as user_count
      FROM cloud_transcription_usage c
      LEFT JOIN licenses l ON l.user_id = c.user_id
      WHERE c.month = ? AND c.extra_minutes_purchased > 0
      GROUP BY COALESCE(l.tier, 'free')
    `)
    .bind(month)
    .all<{ tier: string; extra_minutes: number; user_count: number }>()

  // 16. Storage — row count + blob size + active magic tokens
  const [usersRowCount, syncBlobsStats, cloudUsageRowCount, activeMagicTokens] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) as cnt FROM users').first<{ cnt: number }>(),
    env.DB.prepare('SELECT COUNT(*) as cnt, COALESCE(SUM(blob_size), 0) as total_bytes FROM sync_blobs').first<{ cnt: number; total_bytes: number }>(),
    env.DB.prepare('SELECT COUNT(*) as cnt FROM cloud_transcription_usage').first<{ cnt: number }>(),
    env.DB.prepare('SELECT COUNT(*) as cnt FROM magic_tokens WHERE used = 0 AND expires_at > ?').bind(Date.now()).first<{ cnt: number }>(),
  ])

  // 19. Errori synthesis ultimi 7 giorni
  const synthErrors = await env.DB
    .prepare(`
      SELECT error_code, COUNT(*) as cnt
      FROM synthesis_log
      WHERE error_code IS NOT NULL AND created_at > ?
      GROUP BY error_code
      ORDER BY cnt DESC
      LIMIT 20
    `)
    .bind(sevenDaysAgo)
    .all<{ error_code: string; cnt: number }>()

  // 17. Retention — cancellazioni mese corrente
  const canceledThisMonth = await env.DB
    .prepare(`
      SELECT COUNT(*) as cnt FROM licenses
      WHERE cancelled_at >= ? AND cancelled_at < ?
    `)
    .bind(startOfMonthMs, startOfNextMonthMs)
    .first<{ cnt: number }>()

  // 18. Retention — signup ultimi 30 giorni (per grafico)
  const signupsLast30d = await env.DB
    .prepare(`
      SELECT
        strftime('%Y-%m-%d', datetime(created_at / 1000, 'unixepoch')) as date,
        COUNT(*) as count
      FROM users
      WHERE created_at > ?
      GROUP BY date
      ORDER BY date
    `)
    .bind(thirtyDaysAgo)
    .all<{ date: string; count: number }>()

  // Valori derivati Cloud Veloce
  // Costi/fee/cambio: valori reali iniettati come secret in produzione.
  // Fallback neutri (0 / 1) solo per dev locale — MAI i numeri reali nel repo.
  const voxtralCostPerMin = parseFloat(env.VOXTRAL_COST_USD_PER_MIN ?? '0')
  const usdEurRate = parseFloat(env.USD_EUR_RATE ?? '1')
  const cvTotalMinutes = cloudVeloceAgg?.total_minutes ?? 0
  const cvEstimatedCostUSD = cvTotalMinutes * voxtralCostPerMin
  const cvBudgetCapEUR = parseFloat(env.CLOUD_BUDGET_CAP_EUR ?? '0')
  const cvBudgetUsedPercent = cvBudgetCapEUR > 0
    ? (cvEstimatedCostUSD / usdEurRate / cvBudgetCapEUR) * 100
    : 0
  const synthesisCostUSD = budget?.cost_usd ?? 0
  const ordersCount = extraCreditsOrders?.cnt ?? 0

  // Stima ricavo ore extra
  // Rate basato sul pacchetto medio (900min@€9 Pro, 1200min@€9 Unlimited)
  const EXTRA_EUR_PER_MIN: Record<string, number> = {
    pro: 9 / 900,
    unlimited: 9 / 1200,
  }
  const POLAR_FEE_RATE = parseFloat(env.POLAR_FEE_RATE ?? '0')
  const POLAR_FEE_FIXED_EUR = parseFloat(env.POLAR_FEE_FIXED_EUR ?? '0')

  let extraGrossEUR = 0
  let totalExtraMinSold = 0
  for (const row of extraMinsByTier.results) {
    const rate = EXTRA_EUR_PER_MIN[row.tier] ?? (9 / 900)
    extraGrossEUR += row.extra_minutes * rate
    totalExtraMinSold += row.extra_minutes
  }

  const extraPolarFeesEUR = extraGrossEUR * POLAR_FEE_RATE + ordersCount * POLAR_FEE_FIXED_EUR
  const extraVoxtralCostEUR = totalExtraMinSold * voxtralCostPerMin / usdEurRate
  const extraNetEUR = extraGrossEUR - extraPolarFeesEUR - extraVoxtralCostEUR

  return new Response(JSON.stringify({
    overview: {
      total_users: totalUsers?.cnt ?? 0,
      mrr_eur: Math.round(mrr * 100) / 100,
      budget_used_usd: synthesisCostUSD,
      budget_cap_usd: budget?.cap_usd ?? 0,
    },
    tiers: tierCounts.results,
    synth_by_provider: synthStats.results,
    top_users: topUsers.results,
    recent_signups: recentSignups.results,
    flagged_accounts: flaggedAccounts.results,
    thresholds_triggered: thresholds.results,
    recent_webhooks: webhooks.results,
    subscription_status: subStatus.results,
    cloud_veloce: {
      total_minutes: cvTotalMinutes,
      total_extra_minutes: cloudVeloceAgg?.total_extra_minutes ?? 0,
      estimated_cost_usd: Math.round(cvEstimatedCostUSD * 10000) / 10000,
      budget_cap_eur: cvBudgetCapEUR,
      budget_used_percent: Math.round(cvBudgetUsedPercent * 10) / 10,
      unique_users: cloudVeloceAgg?.unique_users ?? 0,
      top_users: cloudVeloceTopUsers.results,
      distribution: {
        '0_1h': cloudVeloceDist?.d_0_1h ?? 0,
        '1_3h': cloudVeloceDist?.d_1_3h ?? 0,
        '3_5h': cloudVeloceDist?.d_3_5h ?? 0,
        '5h_plus': cloudVeloceDist?.d_5h_plus ?? 0,
      },
      alert_sent: (cloudVeloceAgg?.alert_sent ?? 0) === 1,
    },
    extra_credits: {
      orders_count: ordersCount,
      revenue_gross_eur: Math.round(extraGrossEUR * 100) / 100,
      revenue_net_eur: Math.round(extraNetEUR * 100) / 100,
      polar_fees_eur: Math.round(extraPolarFeesEUR * 100) / 100,
      voxtral_cost_eur: Math.round(extraVoxtralCostEUR * 100) / 100,
      total_extra_minutes: totalExtraMinSold,
      by_tier: extraMinsByTier.results,
      is_estimate: true,
    },
    tech: {
      errors_5xx_last_7d: null as null,
      synthesis_errors_7d: synthErrors.results,
      note: 'Errori 5xx e Mistral 429: logging non implementato',
    },
    storage: {
      blob_total_bytes: syncBlobsStats?.total_bytes ?? 0,
      meetings_count: syncBlobsStats?.cnt ?? 0,
      active_magic_tokens: activeMagicTokens?.cnt ?? 0,
      d1_row_counts: [
        { table: 'users', count: usersRowCount?.cnt ?? 0 },
        { table: 'sync_blobs', count: syncBlobsStats?.cnt ?? 0 },
        { table: 'cloud_transcription_usage', count: cloudUsageRowCount?.cnt ?? 0 },
        { table: 'magic_tokens (attivi)', count: activeMagicTokens?.cnt ?? 0 },
      ],
    },
    retention: {
      canceled_this_month: canceledThisMonth?.cnt ?? 0,
      signups_last_30d: signupsLast30d.results,
    },
    synthesis_cost_breakdown: {
      synthesis_cost_usd: synthesisCostUSD,
      transcription_cost_usd: Math.round(cvEstimatedCostUSD * 10000) / 10000,
      total_cost_usd: Math.round((synthesisCostUSD + cvEstimatedCostUSD) * 10000) / 10000,
    },
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

// ── Comp utenze ──────────────────────────────────────────────────────────────
// Assegnazione manuale di un tier (pro|unlimited) gratis, separata da Polar.
// Vive in comp_grants, non tocca licenses/polar_orders, non entra in nessuna
// metrica di revenue. Vedi migration 0033 e lib/tier.ts per la risoluzione.

const COMP_TIERS = ['pro', 'unlimited'] as const

export async function handleAdminCompList(req: Request, env: Env): Promise<Response> {
  const auth = await requireFounder(req, env)
  if (!auth.ok) return auth.response
  const cors = corsHeaders(req, env)

  // Solo i comp attivi (non scaduti). expires_at > now.
  const rows = await env.DB.prepare(`
    SELECT c.user_id, c.tier, c.expires_at, c.granted_by, c.notes, c.created_at, u.email
    FROM comp_grants c
    LEFT JOIN users u ON u.id = c.user_id
    WHERE c.expires_at > ?
    ORDER BY c.created_at DESC
    LIMIT 200
  `).bind(Date.now()).all()

  return new Response(JSON.stringify({ ok: true, entries: rows.results }), {
    headers: { ...cors, "Content-Type": "application/json" },
  })
}

export async function handleAdminCompAdd(req: Request, env: Env): Promise<Response> {
  const auth = await requireFounder(req, env)
  if (!auth.ok) return auth.response
  const cors = corsHeaders(req, env)

  const body = await req.json().catch(() => null) as
    | { email?: string; tier?: string; expires_at?: number; notes?: string }
    | null
  const email = body?.email?.trim().toLowerCase()
  const tier = body?.tier?.trim()
  const expiresAt = body?.expires_at

  if (!email) {
    return new Response(JSON.stringify({ ok: false, error: "email_required" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    })
  }
  if (!tier || !COMP_TIERS.includes(tier as (typeof COMP_TIERS)[number])) {
    return new Response(JSON.stringify({ ok: false, error: "invalid_tier" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    })
  }
  if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return new Response(JSON.stringify({ ok: false, error: "invalid_expiry" }), {
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

  const now = Date.now()
  const notes = body?.notes?.trim() || null

  // Un comp attivo per utente: UPSERT su user_id. Riassegnare aggiorna tier/scadenza.
  await env.DB.prepare(`
    INSERT INTO comp_grants (user_id, tier, expires_at, granted_by, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      tier = excluded.tier,
      expires_at = excluded.expires_at,
      granted_by = excluded.granted_by,
      notes = excluded.notes,
      created_at = excluded.created_at
  `).bind(user.id, tier, expiresAt, auth.userId, notes, now).run()

  await env.DB.prepare(`
    INSERT INTO comp_grants_log (user_id, email, action, tier, expires_at, actor, notes, created_at)
    VALUES (?, ?, 'grant', ?, ?, ?, ?, ?)
  `).bind(user.id, email, tier, expiresAt, auth.userId, notes, now).run()

  return new Response(JSON.stringify({ ok: true, userId: user.id }), {
    headers: { ...cors, "Content-Type": "application/json" },
  })
}

export async function handleAdminCompRemove(req: Request, env: Env): Promise<Response> {
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

  const existing = await env.DB
    .prepare(`SELECT c.tier, c.expires_at, u.email FROM comp_grants c LEFT JOIN users u ON u.id = c.user_id WHERE c.user_id = ?`)
    .bind(userId)
    .first<{ tier: string; expires_at: number; email: string | null }>()

  await env.DB.prepare('DELETE FROM comp_grants WHERE user_id = ?').bind(userId).run()

  if (existing) {
    await env.DB.prepare(`
      INSERT INTO comp_grants_log (user_id, email, action, tier, expires_at, actor, notes, created_at)
      VALUES (?, ?, 'revoke', ?, ?, ?, NULL, ?)
    `).bind(userId, existing.email, existing.tier, existing.expires_at, auth.userId, Date.now()).run()
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...cors, "Content-Type": "application/json" },
  })
}
