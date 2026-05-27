import type { Env } from '../lib/env'
import { getUserFromSession } from '../lib/sessions'
import { getUserTier } from '../lib/tier'

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

interface TranscribeBody {
  audioBlob: string
  estimatedMinutes: number
  language?: string
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

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.includes(',') ? (b64.split(',')[1] ?? '') : b64
  const bin = atob(clean)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
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

  const body = await req.json().catch(() => null) as TranscribeBody | null
  if (!body?.audioBlob || typeof body.estimatedMinutes !== 'number') {
    return jsonResponse({ error: 'invalid_body' }, 400)
  }

  const projected = usage.minutes_used + Math.max(0, Math.ceil(body.estimatedMinutes))
  if (projected > hardCap) {
    return jsonResponse(
      {
        error: 'would_exceed_hard_cap',
        minutesUsed: usage.minutes_used,
        estimatedMinutes: body.estimatedMinutes,
        hardCap,
      },
      429,
    )
  }

  let bytes: Uint8Array
  try {
    bytes = base64ToBytes(body.audioBlob)
  } catch {
    return jsonResponse({ error: 'invalid_audio' }, 400)
  }

  const form = new FormData()
  form.append('model', 'voxtral-mini-latest')
  form.append('file', new Blob([bytes]), 'audio.webm')
  if (body.language) form.append('language', body.language)
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
  })
}
