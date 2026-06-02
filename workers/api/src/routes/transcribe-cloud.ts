import type { Env } from '../lib/env'
import { getUserFromSession } from '../lib/sessions'
import { getUserTier } from '../lib/tier'

const PACKAGE_PRODUCTS: Record<string, { productId: string; allowedTier: 'pro' | 'unlimited' }> = {
  pro_5h:  { productId: 'fb6c1a92-1d5c-4ea6-b683-f5b324bc437b', allowedTier: 'pro' },
  pro_15h: { productId: 'da7239fb-c3a7-4cff-a71d-77a0e1b257da', allowedTier: 'pro' },
  pro_40h: { productId: '5d1207b4-2369-417e-9cd4-eb3dd3300569', allowedTier: 'pro' },
  pu_8h:   { productId: 'e79cd9b0-9250-4b98-ab14-ab07ebaefe4d', allowedTier: 'unlimited' },
  pu_20h:  { productId: '8d896b13-374f-488e-a1f2-c62be8379872', allowedTier: 'unlimited' },
  pu_55h:  { productId: 'eb9825af-0dd4-4278-bca9-9b0f1cf6fd04', allowedTier: 'unlimited' },
}

const MINUTES_INCLUDED: Record<string, number> = {
  pro: 300,
  unlimited: 1200,
}
const HARD_CAP: Record<string, number> = {
  pro: 1500,
  unlimited: 4800,
}

const GLOBAL_BUDGET_MINUTES = 5000
const ALERT_THRESHOLD_MINUTES = 4000

interface UsageRow {
  id: string
  user_id: string
  month: string
  minutes_used: number
  extra_minutes_purchased: number
  last_updated: number
}

interface MistralUsage {
  prompt_audio_seconds?: number
}

interface MistralResponse {
  text?: string
  segments?: unknown[]
  usage?: MistralUsage
}

function currentMonth(): string {
  const now = new Date()
  const yyyy = now.getUTCFullYear()
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  return `${yyyy}-${mm}`
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function getOrCreateUsage(env: Env, userId: string, month: string): Promise<UsageRow> {
  const existing = await env.DB.prepare(
    `SELECT id, user_id, month, minutes_used, extra_minutes_purchased, last_updated
     FROM cloud_transcription_usage WHERE user_id = ? AND month = ?`
  )
    .bind(userId, month)
    .first<UsageRow>()

  if (existing) return existing

  const row: UsageRow = {
    id: crypto.randomUUID(),
    user_id: userId,
    month,
    minutes_used: 0,
    extra_minutes_purchased: 0,
    last_updated: Date.now(),
  }
  await env.DB.prepare(
    `INSERT INTO cloud_transcription_usage (id, user_id, month, minutes_used, extra_minutes_purchased, last_updated)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(row.id, row.user_id, row.month, row.minutes_used, row.extra_minutes_purchased, row.last_updated)
    .run()
  return row
}

async function sendBudgetAlert(env: Env, totalMinutes: number, month: string): Promise<void> {
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Sonabrief <alerts@sonabrief.com>',
        to: 'sonabrief.app@gmail.com',
        subject: '⚠️ Cloud Veloce: 80% budget raggiunto',
        html: `<p>Il consumo Cloud Veloce per il mese <strong>${month}</strong> ha raggiunto <strong>${totalMinutes} minuti</strong> (soglia 80% di ${GLOBAL_BUDGET_MINUTES} min).</p>`,
      }),
    })
  } catch (err) {
    console.error('[transcribe-cloud] budget alert send failed:', err)
  }
}

async function checkAndAlertBudget(env: Env, month: string): Promise<void> {
  const row = await env.DB.prepare(
    `SELECT COALESCE(SUM(minutes_used), 0) AS total, COALESCE(MAX(budget_alert_sent_80), 0) AS alerted
     FROM cloud_transcription_usage WHERE month = ?`
  )
    .bind(month)
    .first<{ total: number; alerted: number }>()
  const total = row?.total ?? 0
  const alerted = row?.alerted ?? 0
  if (total >= ALERT_THRESHOLD_MINUTES && alerted === 0) {
    await sendBudgetAlert(env, total, month)
    await env.DB.prepare(
      `UPDATE cloud_transcription_usage SET budget_alert_sent_80 = 1 WHERE month = ?`
    )
      .bind(month)
      .run()
  }
}

export async function handleTranscribeCloud(req: Request, env: Env): Promise<Response> {
  const session = await getUserFromSession(req, env)
  if (!session) {
    return jsonResponse({ error: 'unauthorized' }, 401)
  }

  const tier = await getUserTier(session.userId, env)
  if (tier !== 'pro' && tier !== 'unlimited') {
    return jsonResponse({ error: 'pro_required', message: 'Cloud Veloce richiede piano Pro' }, 403)
  }

  const month = currentMonth()
  const usage = await getOrCreateUsage(env, session.userId, month)

  const included = MINUTES_INCLUDED[tier] ?? 0
  const hardCap = HARD_CAP[tier] ?? 0
  const totalAllowance = included + usage.extra_minutes_purchased

  if (usage.minutes_used >= hardCap) {
    return jsonResponse(
      {
        error: 'hard_cap_reached',
        minutesUsed: usage.minutes_used,
        hardCap,
      },
      429,
    )
  }

  const formData = await req.formData().catch(() => null)
  const audio = formData?.get('audio')
  const estimatedMinutes = parseFloat(String(formData?.get('estimatedMinutes') ?? ''))
  const language = formData?.get('language')
  if (!(audio instanceof File) || !Number.isFinite(estimatedMinutes)) {
    return jsonResponse({ error: 'invalid_body' }, 400)
  }

  const projected = usage.minutes_used + Math.max(0, Math.ceil(estimatedMinutes))
  if (projected > hardCap) {
    return jsonResponse(
      {
        error: 'would_exceed_hard_cap',
        minutesUsed: usage.minutes_used,
        estimatedMinutes,
        hardCap,
      },
      429,
    )
  }

  const form = new FormData()
  form.append('model', 'voxtral-mini-latest')
  form.append('file', audio, 'audio.webm')
  if (typeof language === 'string' && language) form.append('language', language)
  form.append('diarize', 'true')
  form.append('timestamp_granularities[]', 'segment')

  const mistralRes = await fetch('https://api.mistral.ai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.MISTRAL_API_KEY}` },
    body: form,
  })

  if (!mistralRes.ok) {
    const errText = await mistralRes.text()
    console.error('[transcribe-cloud] Mistral error:', mistralRes.status, errText)
    if (mistralRes.status === 429) {
      return jsonResponse(
        { error: 'rate_limited', message: 'Servizio temporaneamente occupato, riprova tra qualche secondo' },
        503,
      )
    }
    return jsonResponse({ error: 'transcription_failed' }, 502)
  }

  const result = await mistralRes.json() as MistralResponse
  const promptSeconds = result.usage?.prompt_audio_seconds ?? 0
  const minutesConsumed = Math.max(1, Math.ceil(promptSeconds / 60))

  const newMinutesUsed = usage.minutes_used + minutesConsumed
  const now = Date.now()
  await env.DB.prepare(
    `UPDATE cloud_transcription_usage SET minutes_used = ?, last_updated = ? WHERE id = ?`
  )
    .bind(newMinutesUsed, now, usage.id)
    .run()

  const minutesRemaining = Math.max(0, totalAllowance - newMinutesUsed)

  await checkAndAlertBudget(env, month)

  return jsonResponse({
    transcript: result.text ?? '',
    segments: result.segments ?? [],
    minutesUsed: newMinutesUsed,
    minutesRemaining,
  })
}

export async function handleTranscribeCloudQuota(req: Request, env: Env): Promise<Response> {
  const session = await getUserFromSession(req, env)
  if (!session) {
    return jsonResponse({ error: 'unauthorized' }, 401)
  }

  const tier = await getUserTier(session.userId, env)
  if (tier !== 'pro' && tier !== 'unlimited') {
    return jsonResponse({ error: 'pro_required', message: 'Cloud Veloce richiede piano Pro' }, 403)
  }

  const month = currentMonth()
  const usage = await getOrCreateUsage(env, session.userId, month)
  const included = MINUTES_INCLUDED[tier] ?? 0
  const hardCap = HARD_CAP[tier] ?? 0
  const totalAllowance = included + usage.extra_minutes_purchased
  const minutesRemaining = Math.max(0, totalAllowance - usage.minutes_used)

  return jsonResponse({
    minutesUsed: usage.minutes_used,
    minutesIncluded: included,
    minutesRemaining,
    hardCap,
    extraMinutesPurchased: usage.extra_minutes_purchased,
    tier,
  })
}

export async function handleTranscribeCloudCheckout(req: Request, env: Env): Promise<Response> {
  const session = await getUserFromSession(req, env)
  if (!session) return jsonResponse({ error: 'unauthorized' }, 401)

  const tier = await getUserTier(session.userId, env)
  if (tier !== 'pro' && tier !== 'unlimited') {
    return jsonResponse({ error: 'pro_required' }, 403)
  }

  const url = new URL(req.url)
  const pkg = url.searchParams.get('package')
  const pkgInfo = pkg ? PACKAGE_PRODUCTS[pkg] : null
  if (!pkgInfo) return jsonResponse({ error: 'invalid_package' }, 400)

  if (pkgInfo.allowedTier !== tier) {
    return jsonResponse({ error: 'package_not_available_for_tier' }, 403)
  }

  const userRow = await env.DB
    .prepare('SELECT email FROM users WHERE id = ?')
    .bind(session.userId)
    .first<{ email: string }>()
  if (!userRow) return jsonResponse({ error: 'user_not_found' }, 404)

  const polarRes = await fetch('https://api.polar.sh/v1/checkouts/', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.POLAR_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      product_id: pkgInfo.productId,
      customer_email: userRow.email,
      metadata: { user_id: session.userId },
      success_url: 'https://sonabrief.com/app',
    }),
  })

  if (!polarRes.ok) {
    const errText = await polarRes.text()
    console.error('[transcribe-cloud] checkout error:', polarRes.status, errText)
    return jsonResponse({ error: 'checkout_failed' }, 502)
  }

  const data = await polarRes.json() as { url: string }
  return jsonResponse({ checkoutUrl: data.url })
}
