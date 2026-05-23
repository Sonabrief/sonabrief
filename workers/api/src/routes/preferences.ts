import type { Env } from '../lib/env'
import { getUserFromSession } from '../lib/sessions'

interface UserPreferences {
  language: string
  profession: string | null
  profession_category: string | null
  context_note: string | null
  meeting_duration: string | null
  client_volume: string | null
  synthesis_mode: string
  sync_enabled: number
  onboarded: number
  display_name: string | null
  weekly_reminder_enabled: number
}

export async function handleGetPreferences(req: Request, env: Env): Promise<Response> {
  const session = await getUserFromSession(req, env)
  if (!session) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
  }

  const prefs = await env.DB
    .prepare('SELECT * FROM user_preferences WHERE user_id = ?')
    .bind(session.userId)
    .first<UserPreferences>()

  if (!prefs) {
    return new Response(JSON.stringify({
      language: 'it',
      profession: null,
      profession_category: null,
      context_note: null,
      meeting_duration: null,
      client_volume: null,
      synthesis_mode: 'standard',
      sync_enabled: 0,
      onboarded: 0,
      display_name: null,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  return new Response(JSON.stringify(prefs), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function handleSavePreferences(req: Request, env: Env): Promise<Response> {
  const session = await getUserFromSession(req, env)
  if (!session) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
  }

  const body = await req.json().catch(() => null) as Partial<UserPreferences> | null
  if (!body) {
    return new Response(JSON.stringify({ error: 'invalid_body' }), { status: 400 })
  }

  const now = Date.now()

  await env.DB
    .prepare(`
      INSERT INTO user_preferences (
        user_id, language, profession, profession_category,
        context_note, meeting_duration, client_volume,
        synthesis_mode, sync_enabled, onboarded, display_name,
        weekly_reminder_enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        language = COALESCE(excluded.language, language),
        profession = COALESCE(excluded.profession, profession),
        profession_category = COALESCE(excluded.profession_category, profession_category),
        context_note = COALESCE(excluded.context_note, context_note),
        meeting_duration = COALESCE(excluded.meeting_duration, meeting_duration),
        client_volume = COALESCE(excluded.client_volume, client_volume),
        synthesis_mode = COALESCE(excluded.synthesis_mode, synthesis_mode),
        sync_enabled = COALESCE(excluded.sync_enabled, sync_enabled),
        onboarded = COALESCE(excluded.onboarded, onboarded),
        display_name = COALESCE(excluded.display_name, display_name),
        weekly_reminder_enabled = COALESCE(excluded.weekly_reminder_enabled, weekly_reminder_enabled),
        updated_at = excluded.updated_at
    `)
    .bind(
      session.userId,
      body.language ?? 'it',
      body.profession ?? null,
      body.profession_category ?? null,
      body.context_note ?? null,
      body.meeting_duration ?? null,
      body.client_volume ?? null,
      body.synthesis_mode ?? 'standard',
      body.sync_enabled ?? 0,
      body.onboarded ?? 0,
      body.display_name ?? null,
      body.weekly_reminder_enabled ?? 0,
      now,
      now,
    )
    .run()

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function handlePatchPreferences(req: Request, env: Env): Promise<Response> {
  const session = await getUserFromSession(req, env)
  if (!session) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
  }

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body || typeof body !== 'object') {
    return new Response(JSON.stringify({ error: 'invalid_body' }), { status: 400 })
  }

  const allowed = ['language', 'synthesis_mode', 'profession', 'display_name',
                   'weekly_reminder_enabled', 'sync_enabled', 'onboarded']
  const fields = Object.keys(body).filter(k => allowed.includes(k))

  if (fields.length === 0) {
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  }

  const setClauses = fields.map(f => `${f} = ?`).join(', ')
  const values = fields.map(f => {
    const v = body[f]
    if (f === 'display_name' && typeof v === 'string' && v.length > 0) {
      return v.charAt(0).toUpperCase() + v.slice(1)
    }
    return v
  })

  await env.DB
    .prepare(`UPDATE user_preferences SET ${setClauses}, updated_at = ? WHERE user_id = ?`)
    .bind(...values, Date.now(), session.userId)
    .run()

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
