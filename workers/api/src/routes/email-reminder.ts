import type { Env } from '../lib/env'
import { getUserFromSession } from '../lib/sessions'
import { getUserTier } from '../lib/tier'

interface ReminderPayload {
  actionItems: Array<{
    content: string
    clientName?: string
    meetingTitle?: string
    dueDate?: string
  }>
}

export async function handleSendWeeklyReminder(req: Request, env: Env): Promise<Response> {
  const session = await getUserFromSession(req, env)
  if (!session) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
  }

  // Solo Pro+
  const tier = await getUserTier(session.userId, env)
  if (tier === 'free') {
    return new Response(JSON.stringify({ error: 'pro_required' }), { status: 403 })
  }

  const userRow = await env.DB
    .prepare('SELECT email FROM users WHERE id = ?')
    .bind(session.userId)
    .first<{ email: string }>()
  if (!userRow) {
    return new Response(JSON.stringify({ error: 'user_not_found' }), { status: 404 })
  }

  // Verifica opt-in
  const prefs = await env.DB
    .prepare('SELECT weekly_reminder_enabled, display_name FROM user_preferences WHERE user_id = ?')
    .bind(session.userId)
    .first<{ weekly_reminder_enabled: number; display_name: string | null }>()

  if (!prefs?.weekly_reminder_enabled) {
    return new Response(JSON.stringify({ error: 'reminder_disabled' }), { status: 403 })
  }

  const body = await req.json().catch(() => null) as ReminderPayload | null
  if (!body?.actionItems?.length) {
    return new Response(JSON.stringify({ error: 'no_items' }), { status: 400 })
  }

  const name = prefs.display_name ?? 'ciao'
  const itemsHtml = body.actionItems.map(item => {
    const meta = [item.clientName, item.meetingTitle].filter(Boolean).join(' · ')
    const due = item.dueDate ? ` <span style="color:#888;font-size:12px">(entro ${item.dueDate})</span>` : ''
    return `<li style="margin-bottom:8px">
      <span style="font-size:15px">${item.content}</span>${due}
      ${meta ? `<br><span style="color:#888;font-size:12px">${meta}</span>` : ''}
    </li>`
  }).join('')

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px 16px;color:#1a1a1a">
  <img src="https://app.sonabrief.com/icons/icon-192.png" width="40" height="40" style="border-radius:10px;margin-bottom:24px" alt="Sonabrief">
  <h2 style="font-size:20px;font-weight:600;margin:0 0 8px">Ciao ${name}, ecco i tuoi action items aperti</h2>
  <p style="color:#666;font-size:14px;margin:0 0 24px">Riepilogo settimanale — ${new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
  <ul style="padding-left:20px;margin:0 0 32px">${itemsHtml}</ul>
  <a href="https://app.sonabrief.com/actions" style="display:inline-block;background:#1A4D52;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:14px">Apri in Sonabrief →</a>
  <p style="margin-top:32px;font-size:12px;color:#aaa">Hai ricevuto questa email perché hai attivato il reminder settimanale in <a href="https://app.sonabrief.com/profile" style="color:#1A4D52">Impostazioni</a>. Puoi disattivarlo in qualsiasi momento.</p>
</body>
</html>`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Sonabrief <reminder@sonabrief.com>',
      to: userRow.email,
      subject: `I tuoi action items aperti — ${new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}`,
      html,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('[reminder] Resend error:', err)
    return new Response(JSON.stringify({ error: 'send_failed' }), { status: 500 })
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
