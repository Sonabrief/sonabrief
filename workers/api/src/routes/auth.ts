import type { Env } from "../lib/env";
import { corsHeaders } from "../lib/cors";

export async function handleAuthRequest(request: Request, env: Env): Promise<Response> {
  const cors = corsHeaders(request, env);
  const body = (await request.json().catch(() => null)) as { email?: string } | null;
  const email = body?.email;

  if (!email) {
    return new Response("Email required", { status: 400, headers: cors });
  }

  const userId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT OR IGNORE INTO users (id, email, created_at) VALUES (?, ?, ?)`
  )
    .bind(userId, email, Date.now())
    .run();

  const user = await env.DB.prepare(`SELECT id FROM users WHERE email = ?`)
    .bind(email)
    .first<{ id: string }>();

  const token = crypto.randomUUID();
  const expiresAt = Date.now() + 1000 * 60 * 15; // 15 minuti

  await env.DB.prepare(
    `INSERT INTO magic_tokens (token, user_id, expires_at) VALUES (?, ?, ?)`
  )
    .bind(token, user!.id, expiresAt)
    .run();

  const magicLink = `${env.APP_URL}/auth/verify?token=${token}`;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Sonabrief <hello@sonabrief.com>",
      to: email,
      subject: "Il tuo link di accesso a Sonabrief",
      html: `<p>Clicca il link per accedere. Scade tra 15 minuti.</p><a href="${magicLink}">${magicLink}</a>`,
    }),
  });

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

export async function handleAuthVerify(request: Request, env: Env): Promise<Response> {
  const cors = corsHeaders(request, env);
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return new Response("Token required", { status: 400, headers: cors });
  }

  const record = await env.DB.prepare(
    `SELECT * FROM magic_tokens WHERE token = ? AND used = 0 AND expires_at > ?`
  )
    .bind(token, Date.now())
    .first<{ user_id: string }>();

  if (!record) {
    return new Response(
      JSON.stringify({ ok: false, error: "Token non valido o scaduto" }),
      {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      }
    );
  }

  await env.DB.prepare(`UPDATE magic_tokens SET used = 1 WHERE token = ?`)
    .bind(token)
    .run();

  return new Response(JSON.stringify({ ok: true, userId: record.user_id }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
}