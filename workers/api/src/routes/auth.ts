import type { Env } from "../lib/env";
import { corsHeaders } from "../lib/cors";
import { createSession, destroySession, getUserFromSession } from "../lib/sessions";
import {
  hashIP,
  isDisposableEmail,
  isDatacenterIP,
  fingerprint,
  checkAndUpdateIPThrottle,
  recordSignupSignals,
  isUserWhitelisted,
  isTrustedASN,
} from "../lib/antiabuse";

interface AuthRequestBody {
  email?: string;
  timezone?: string;
  screen_resolution?: string;
}

function getMagicLinkBase(request: Request): string {
  const origin = request.headers.get("Origin");
  if (origin && (origin.includes("localhost") || origin.endsWith("sonabrief.com"))) {
    return origin;
  }
  return "https://sonabrief.com";
}

export async function handleAuthRequest(request: Request, env: Env): Promise<Response> {
  const cors = corsHeaders(request, env);
  const body = (await request.json().catch(() => null)) as AuthRequestBody | null;
  const email = body?.email?.trim().toLowerCase();

  if (!email) {
    return new Response(JSON.stringify({ ok: false, error: "email_required" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Check 1: disposable email
  if (isDisposableEmail(email)) {
    return new Response(JSON.stringify({ ok: false, error: "disposable_email" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Estrai segnali HTTP
  const ip = request.headers.get("CF-Connecting-IP") ?? request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ?? "0.0.0.0";
  const userAgent = request.headers.get("User-Agent");
  const acceptLanguage = request.headers.get("Accept-Language");

  // Check 2: IP datacenter blocco hard solo se NON è un'email già esistente
  // (utenti legittimi che si rilogganno da rete aziendale potrebbero passare per IP datacenter)
  const existingUser = await env.DB.prepare(`SELECT id FROM users WHERE email = ?`)
    .bind(email)
    .first<{ id: string }>();

  // Whitelist check: utenti già whitelistati bypassano tutti i controlli successivi
  const userWhitelisted = existingUser ? await isUserWhitelisted(existingUser.id, env) : false

  // ASN aziendali trusted (Cloudflare passa cf.asn nativamente)
  const asn = (request as any).cf?.asn as number | undefined
  const asnTrusted = isTrustedASN(asn)

  if (!existingUser && isDatacenterIP(ip) && !asnTrusted) {
    return new Response(JSON.stringify({ ok: false, error: "datacenter_ip_blocked" }), {
      status: 403,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const ipHash = await hashIP(ip);

  // Check 3: IP throttling — solo per nuovi signup, non per re-login
  if (!existingUser && !asnTrusted) {
    const throttle = await checkAndUpdateIPThrottle(ipHash, env);
    if (!throttle.allowed) {
      return new Response(JSON.stringify({ ok: false, error: "rate_limited", reason: throttle.reason }), {
        status: 429,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
  }

  // Create user se nuovo
  const userId = existingUser?.id ?? crypto.randomUUID();
  if (!existingUser) {
    await env.DB.prepare(
      `INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)`
    )
      .bind(userId, email, Date.now())
      .run();

    // Record signup signals + fingerprint check
    const signals = {
      user_agent: userAgent,
      accept_language: acceptLanguage,
      timezone: body?.timezone ?? null,
      screen_resolution: body?.screen_resolution ?? null,
    };
    const fingerprintHash = await fingerprint(signals);
    await recordSignupSignals(userId, ipHash, signals, fingerprintHash, env);
  }

  if (existingUser) {
    const activeTokens = await env.DB
      .prepare(`SELECT COUNT(*) as count FROM magic_tokens
                WHERE user_id = ? AND used = 0 AND expires_at > ?`)
      .bind(userId, Date.now())
      .first<{ count: number }>()

    if ((activeTokens?.count ?? 0) >= 3) {
      return new Response(JSON.stringify({ ok: false, error: "rate_limited" }), {
        status: 429,
        headers: { ...cors, "Content-Type": "application/json" },
      })
    }
  }

  const token = crypto.randomUUID();
  const expiresAt = Date.now() + 1000 * 60 * 15;

  await env.DB.prepare(
    `INSERT INTO magic_tokens (token, user_id, expires_at) VALUES (?, ?, ?)`
  )
    .bind(token, userId, expiresAt)
    .run();

  const baseUrl = getMagicLinkBase(request);
  const magicLink = `${baseUrl}/auth/verify?token=${token}`;

  const resendRes = await fetch("https://api.resend.com/emails", {
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

  if (!resendRes.ok) {
    console.error("[auth] resend failed:", resendRes.status);
    return new Response(JSON.stringify({ ok: false, error: "email_send_failed" }), {
      status: 502,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

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

  const { cookieHeader } = await createSession(env, record.user_id, request);

  return new Response(JSON.stringify({ ok: true, userId: record.user_id }), {
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Set-Cookie": cookieHeader,
    },
  });
}

export async function handleAuthLogout(request: Request, env: Env): Promise<Response> {
  const cors = corsHeaders(request, env);
  const user = await getUserFromSession(request, env);

  if (!user) {
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const clearCookieHeader = await destroySession(env, user.sessionId, request);

  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Set-Cookie": clearCookieHeader,
    },
  });
}

export async function handleAuthMe(request: Request, env: Env): Promise<Response> {
  const cors = corsHeaders(request, env);
  const user = await getUserFromSession(request, env);

  if (!user) {
    return new Response(JSON.stringify({ ok: false }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const userRow = await env.DB
    .prepare('SELECT email FROM users WHERE id = ?')
    .bind(user.userId)
    .first<{ email: string }>()

  const prefs = await env.DB
    .prepare('SELECT display_name FROM user_preferences WHERE user_id = ?')
    .bind(user.userId)
    .first<{ display_name: string | null }>()

  return new Response(JSON.stringify({
    ok: true,
    userId: user.userId,
    email: userRow?.email ?? '',
    display_name: prefs?.display_name ?? null,
  }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
