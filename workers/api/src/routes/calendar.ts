import type { Env } from '../lib/env'
import { getUserFromSession } from '../lib/sessions'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_CALENDAR_URL = 'https://www.googleapis.com/calendar/v3'
const SCOPES = 'https://www.googleapis.com/auth/calendar.readonly'

function getAppUrl(req: Request): string {
  const origin = req.headers.get('Origin')
  if (origin && (origin.includes('localhost') || origin.endsWith('sonabrief.com'))) {
    return origin
  }
  return 'https://sonabrief.com'
}

function getRedirectUri(req: Request): string {
  return `${getAppUrl(req)}/auth/google/callback`
}

export async function handleGoogleStart(req: Request, env: Env): Promise<Response> {
  const session = await getUserFromSession(req, env)
  if (!session) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
  }

  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: getRedirectUri(req),
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state: session.userId,
  })

  const url = `${GOOGLE_AUTH_URL}?${params.toString()}`
  return new Response(JSON.stringify({ url }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function handleGoogleCallback(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const userId = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  const appUrl = getAppUrl(req)

  if (error || !code || !userId) {
    return Response.redirect(`${appUrl}/dashboard?calendar_error=1`, 302)
  }

  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: getRedirectUri(req),
      grant_type: 'authorization_code',
    }),
  })

  if (!tokenRes.ok) {
    console.error('[calendar] token exchange failed:', await tokenRes.text())
    return Response.redirect(`${appUrl}/dashboard?calendar_error=1`, 302)
  }

  const tokens = await tokenRes.json() as {
    access_token: string
    refresh_token?: string
    expires_in: number
    scope: string
  }

  const expiresAt = Date.now() + tokens.expires_in * 1000
  const now = Date.now()

  await env.DB
    .prepare(`
      INSERT INTO oauth_tokens (user_id, provider, access_token, refresh_token, expires_at, scope, created_at, updated_at)
      VALUES (?, 'google', ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, provider) DO UPDATE SET
        access_token = excluded.access_token,
        refresh_token = COALESCE(excluded.refresh_token, refresh_token),
        expires_at = excluded.expires_at,
        scope = excluded.scope,
        updated_at = excluded.updated_at
    `)
    .bind(userId, tokens.access_token, tokens.refresh_token ?? null, expiresAt, tokens.scope, now, now)
    .run()

  return Response.redirect(`${getAppUrl(req)}/dashboard?calendar_connected=1`, 302)
}

async function refreshAccessToken(env: Env, userId: string, refreshToken: string): Promise<string | null> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) return null
  const data = await res.json() as { access_token: string; expires_in: number }
  const expiresAt = Date.now() + data.expires_in * 1000
  await env.DB
    .prepare('UPDATE oauth_tokens SET access_token = ?, expires_at = ?, updated_at = ? WHERE user_id = ? AND provider = ?')
    .bind(data.access_token, expiresAt, Date.now(), userId, 'google')
    .run()
  return data.access_token
}

async function getValidAccessToken(env: Env, userId: string): Promise<string | null> {
  const row = await env.DB
    .prepare('SELECT access_token, refresh_token, expires_at FROM oauth_tokens WHERE user_id = ? AND provider = ?')
    .bind(userId, 'google')
    .first<{ access_token: string; refresh_token: string | null; expires_at: number }>()

  if (!row) return null

  if (row.expires_at && Date.now() > row.expires_at - 60_000) {
    if (!row.refresh_token) return null
    return refreshAccessToken(env, userId, row.refresh_token)
  }

  return row.access_token
}

export async function handleCalendarEvents(req: Request, env: Env): Promise<Response> {
  const session = await getUserFromSession(req, env)
  if (!session) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
  }

  const accessToken = await getValidAccessToken(env, session.userId)
  if (!accessToken) {
    return new Response(JSON.stringify({ error: 'not_connected', connected: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const now = new Date()
  const timeMin = now.toISOString()
  const timeMax = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const calRes = await fetch(
    `${GOOGLE_CALENDAR_URL}/calendars/primary/events?` +
    new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '10',
      fields: 'items(id,summary,start,end,attendees)',
    }),
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  if (!calRes.ok) {
    return new Response(JSON.stringify({ error: 'calendar_fetch_failed', connected: true }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const data = await calRes.json() as {
    items: {
      id: string
      summary: string
      start: { dateTime?: string; date?: string }
      end: { dateTime?: string; date?: string }
      attendees?: { email: string; displayName?: string }[]
    }[]
  }

  return new Response(JSON.stringify({
    connected: true,
    events: data.items.map(e => ({
      id: e.id,
      title: e.summary,
      start: e.start.dateTime ?? e.start.date,
      end: e.end.dateTime ?? e.end.date,
      attendees: (e.attendees ?? []).map(a => ({ email: a.email, name: a.displayName })),
    })),
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function handleCalendarDisconnect(req: Request, env: Env): Promise<Response> {
  const session = await getUserFromSession(req, env)
  if (!session) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
  }

  await env.DB
    .prepare('DELETE FROM oauth_tokens WHERE user_id = ? AND provider = ?')
    .bind(session.userId, 'google')
    .run()

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

// ─── Microsoft 365 ────────────────────────────────────────────────────────────

const MS_AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize'
const MS_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
const MS_CALENDAR_URL = 'https://graph.microsoft.com/v1.0/me/calendarView'
const MS_SCOPES = 'offline_access Calendars.Read'

function getMsRedirectUri(req: Request): string {
  return `${getAppUrl(req)}/auth/microsoft/callback`
}

export async function handleMicrosoftStart(req: Request, env: Env): Promise<Response> {
  const session = await getUserFromSession(req, env)
  if (!session) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
  }

  const params = new URLSearchParams({
    client_id: env.MICROSOFT_CLIENT_ID,
    redirect_uri: getMsRedirectUri(req),
    response_type: 'code',
    scope: MS_SCOPES,
    response_mode: 'query',
    state: session.userId,
  })

  const url = `${MS_AUTH_URL}?${params.toString()}`
  return new Response(JSON.stringify({ url }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function handleMicrosoftCallback(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const userId = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  const appUrl = getAppUrl(req)

  if (error || !code || !userId) {
    return Response.redirect(`${appUrl}/dashboard?calendar_error=1`, 302)
  }

  const tokenRes = await fetch(MS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.MICROSOFT_CLIENT_ID,
      client_secret: env.MICROSOFT_CLIENT_SECRET,
      redirect_uri: getMsRedirectUri(req),
      grant_type: 'authorization_code',
      scope: MS_SCOPES,
    }),
  })

  if (!tokenRes.ok) {
    console.error('[calendar/ms] token exchange failed:', await tokenRes.text())
    return Response.redirect(`${appUrl}/dashboard?calendar_error=1`, 302)
  }

  const tokens = await tokenRes.json() as {
    access_token: string
    refresh_token?: string
    expires_in: number
    scope: string
  }

  const expiresAt = Date.now() + tokens.expires_in * 1000
  const now = Date.now()

  await env.DB
    .prepare(`
      INSERT INTO oauth_tokens (user_id, provider, access_token, refresh_token, expires_at, scope, created_at, updated_at)
      VALUES (?, 'microsoft', ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, provider) DO UPDATE SET
        access_token = excluded.access_token,
        refresh_token = COALESCE(excluded.refresh_token, refresh_token),
        expires_at = excluded.expires_at,
        scope = excluded.scope,
        updated_at = excluded.updated_at
    `)
    .bind(userId, tokens.access_token, tokens.refresh_token ?? null, expiresAt, tokens.scope, now, now)
    .run()

  return Response.redirect(`${appUrl}/dashboard?calendar_connected=1`, 302)
}

async function refreshMicrosoftToken(env: Env, userId: string, refreshToken: string): Promise<string | null> {
  const res = await fetch(MS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.MICROSOFT_CLIENT_ID,
      client_secret: env.MICROSOFT_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      scope: MS_SCOPES,
    }),
  })
  if (!res.ok) return null
  const data = await res.json() as { access_token: string; expires_in: number }
  const expiresAt = Date.now() + data.expires_in * 1000
  await env.DB
    .prepare('UPDATE oauth_tokens SET access_token = ?, expires_at = ?, updated_at = ? WHERE user_id = ? AND provider = ?')
    .bind(data.access_token, expiresAt, Date.now(), userId, 'microsoft')
    .run()
  return data.access_token
}

export async function handleMicrosoftCalendarEvents(req: Request, env: Env): Promise<Response> {
  const session = await getUserFromSession(req, env)
  if (!session) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
  }

  const row = await env.DB
    .prepare('SELECT access_token, refresh_token, expires_at FROM oauth_tokens WHERE user_id = ? AND provider = ?')
    .bind(session.userId, 'microsoft')
    .first<{ access_token: string; refresh_token: string | null; expires_at: number }>()

  if (!row) {
    return new Response(JSON.stringify({ error: 'not_connected', connected: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let accessToken = row.access_token
  if (row.expires_at && Date.now() > row.expires_at - 60_000) {
    if (!row.refresh_token) {
      return new Response(JSON.stringify({ error: 'token_expired', connected: false }), { status: 200 })
    }
    const refreshed = await refreshMicrosoftToken(env, session.userId, row.refresh_token)
    if (!refreshed) {
      return new Response(JSON.stringify({ error: 'refresh_failed', connected: false }), { status: 200 })
    }
    accessToken = refreshed
  }

  const now = new Date()
  const startDateTime = now.toISOString()
  const endDateTime = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const calRes = await fetch(
    `${MS_CALENDAR_URL}?` + new URLSearchParams({
      startDateTime,
      endDateTime,
      '$select': 'id,subject,start,end,attendees',
      '$orderby': 'start/dateTime',
      '$top': '10',
    }),
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  if (!calRes.ok) {
    return new Response(JSON.stringify({ error: 'calendar_fetch_failed', connected: true }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const data = await calRes.json() as {
    value: {
      id: string
      subject: string
      start: { dateTime: string }
      end: { dateTime: string }
      attendees?: { emailAddress: { address: string; name?: string } }[]
    }[]
  }

  return new Response(JSON.stringify({
    connected: true,
    events: data.value.map(e => ({
      id: e.id,
      title: e.subject,
      start: e.start.dateTime,
      end: e.end.dateTime,
      attendees: (e.attendees ?? []).map(a => ({
        email: a.emailAddress.address,
        name: a.emailAddress.name,
      })),
    })),
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function handleMicrosoftDisconnect(req: Request, env: Env): Promise<Response> {
  const session = await getUserFromSession(req, env)
  if (!session) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
  }

  await env.DB
    .prepare('DELETE FROM oauth_tokens WHERE user_id = ? AND provider = ?')
    .bind(session.userId, 'microsoft')
    .run()

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
