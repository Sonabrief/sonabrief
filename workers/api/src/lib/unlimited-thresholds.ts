import type { Env } from './env'

const THRESHOLDS = [
  { hours: 80, action: 'alert' as const },
  { hours: 150, action: 'flag_review' as const },
  { hours: 300, action: 'rate_limit' as const },
]

function currentMonth(): string {
  const d = new Date()
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0')
}

async function sendAlertEmail(env: Env, userId: string, userEmail: string, hours: number, action: string): Promise<void> {
  const subject = `[Sonabrief] Pro Unlimited threshold ${hours}h reached`
  const html = `
    <p>L'utente <strong>${userEmail}</strong> (ID: ${userId}) ha superato la soglia di <strong>${hours}h</strong> di sintesi cloud nel mese corrente.</p>
    <p>Azione automatica: <strong>${action}</strong></p>
    <p>Mese: ${currentMonth()}</p>
  `
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Sonabrief Alerts <hello@sonabrief.com>',
      to: env.FOUNDER_EMAIL ?? 'noreply@localhost',
      subject,
      html,
    }),
  })
}

async function flagUserForReview(env: Env, userId: string): Promise<void> {
  await env.DB
    .prepare('UPDATE signup_signals SET flagged = 1, flag_reason = COALESCE(flag_reason, ?) WHERE user_id = ?')
    .bind('unlimited_threshold_150h', userId)
    .run()
}

export async function checkUnlimitedThresholds(
  env: Env,
  userId: string,
  userEmail: string,
  tier: string,
  totalMinutesThisMonth: number,
): Promise<void> {
  if (tier !== 'unlimited') return

  const totalHours = Math.floor(totalMinutesThisMonth / 60)
  const month = currentMonth()

  for (const threshold of THRESHOLDS) {
    if (totalHours < threshold.hours) continue

    // Già triggered questo mese?
    const existing = await env.DB
      .prepare('SELECT triggered_at FROM unlimited_thresholds_triggered WHERE user_id = ? AND month = ? AND threshold_hours = ?')
      .bind(userId, month, threshold.hours)
      .first()
    if (existing) continue

    // Esegui l'azione
    try {
      if (threshold.action === 'alert' || threshold.action === 'flag_review' || threshold.action === 'rate_limit') {
        await sendAlertEmail(env, userId, userEmail, threshold.hours, threshold.action)
      }
      if (threshold.action === 'flag_review' || threshold.action === 'rate_limit') {
        await flagUserForReview(env, userId)
      }
    } catch (err) {
      console.error('[unlimited-threshold] action failed:', err)
    }

    // Registra il trigger
    await env.DB
      .prepare('INSERT INTO unlimited_thresholds_triggered (user_id, month, threshold_hours, triggered_at) VALUES (?, ?, ?, ?)')
      .bind(userId, month, threshold.hours, Date.now())
      .run()
  }
}
