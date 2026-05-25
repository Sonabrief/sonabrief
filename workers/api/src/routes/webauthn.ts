import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from "@simplewebauthn/server";
import type { Env } from "../lib/env";
import { corsHeaders } from "../lib/cors";
import { createSession, getUserFromSession } from "../lib/sessions";

const CHALLENGE_TTL_MS = 1000 * 60 * 5; // 5 minuti

function getExpectedOrigin(request: Request, env: Env): string {
  const origin = request.headers.get("Origin");
  if (origin && (origin.includes("localhost") || origin.endsWith("sonabrief.com"))) {
    return origin;
  }
  return "https://sonabrief.com";
}

function b64urlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const buf = new ArrayBuffer(bin.length);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// === REGISTRAZIONE ===

export async function handleWebAuthnRegisterOptions(
  request: Request,
  env: Env
): Promise<Response> {
  const cors = corsHeaders(request, env);
  const user = await getUserFromSession(request, env);
  if (!user) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const userRow = await env.DB.prepare(`SELECT email FROM users WHERE id = ?`)
    .bind(user.userId)
    .first<{ email: string }>();
  if (!userRow) {
    return new Response(JSON.stringify({ ok: false, error: "user_not_found" }), {
      status: 404,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Credenziali già registrate (per exclude list)
  const existing = await env.DB.prepare(
    `SELECT credential_id FROM webauthn_credentials WHERE user_id = ?`
  )
    .bind(user.userId)
    .all<{ credential_id: string }>();

  const options = await generateRegistrationOptions({
    rpName: env.WEBAUTHN_RP_NAME,
    rpID: env.WEBAUTHN_RP_ID,
    userID: new TextEncoder().encode(user.userId),
    userName: userRow.email,
    userDisplayName: userRow.email,
    attestationType: "none",
    excludeCredentials: existing.results.map((c) => ({
      id: c.credential_id,
      type: "public-key",
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  await env.DB.prepare(
    `INSERT INTO webauthn_challenges (challenge, user_id, type, expires_at) VALUES (?, ?, 'registration', ?)`
  )
    .bind(options.challenge, user.userId, Date.now() + CHALLENGE_TTL_MS)
    .run();

  return new Response(JSON.stringify({ ok: true, options }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

export async function handleWebAuthnRegisterVerify(
  request: Request,
  env: Env
): Promise<Response> {
  const cors = corsHeaders(request, env);
  const user = await getUserFromSession(request, env);
  if (!user) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const body = (await request.json().catch(() => null)) as {
    response?: RegistrationResponseJSON;
    deviceName?: string;
  } | null;

  if (!body?.response) {
    return new Response(JSON.stringify({ ok: false, error: "missing_response" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const expectedChallenge = body.response.response.clientDataJSON
    ? JSON.parse(new TextDecoder().decode(b64urlDecode(body.response.response.clientDataJSON))).challenge
    : null;

  if (!expectedChallenge) {
    return new Response(JSON.stringify({ ok: false, error: "missing_challenge" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const challengeRow = await env.DB.prepare(
    `SELECT user_id FROM webauthn_challenges WHERE challenge = ? AND type = 'registration' AND expires_at > ?`
  )
    .bind(expectedChallenge, Date.now())
    .first<{ user_id: string }>();

  if (!challengeRow || challengeRow.user_id !== user.userId) {
    return new Response(JSON.stringify({ ok: false, error: "invalid_challenge" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  await env.DB.prepare(`DELETE FROM webauthn_challenges WHERE challenge = ?`)
    .bind(expectedChallenge)
    .run();

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge,
      expectedOrigin: getExpectedOrigin(request, env),
      expectedRPID: env.WEBAUTHN_RP_ID,
      requireUserVerification: false,
    });
  } catch (err) {
    console.error("[webauthn] register verify failed:", err);
    return new Response(JSON.stringify({ ok: false, error: "verification_failed" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  if (!verification.verified || !verification.registrationInfo) {
    return new Response(JSON.stringify({ ok: false, error: "not_verified" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const { credential } = verification.registrationInfo;

  await env.DB.prepare(
    `INSERT INTO webauthn_credentials (id, user_id, credential_id, public_key, counter, device_name, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      crypto.randomUUID(),
      user.userId,
      credential.id,
      b64urlEncode(credential.publicKey),
      credential.counter,
      body.deviceName ?? null,
      Date.now()
    )
    .run();

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// === AUTENTICAZIONE ===

export async function handleWebAuthnAuthenticateOptions(
  request: Request,
  env: Env
): Promise<Response> {
  const cors = corsHeaders(request, env);
  const body = (await request.json().catch(() => null)) as { email?: string } | null;
  const email = body?.email?.trim().toLowerCase();

  // Email opzionale: se assente, usiamo discoverable credentials (passkey-first UX)
  let allowCredentials: { id: string; type: "public-key" }[] | undefined;
  let userId: string | null = null;

  if (email) {
    const userRow = await env.DB.prepare(`SELECT id FROM users WHERE email = ?`)
      .bind(email)
      .first<{ id: string }>();
    if (userRow) {
      userId = userRow.id;
      const creds = await env.DB.prepare(
        `SELECT credential_id FROM webauthn_credentials WHERE user_id = ?`
      )
        .bind(userId)
        .all<{ credential_id: string }>();
      allowCredentials = creds.results.map((c) => ({
        id: c.credential_id,
        type: "public-key" as const,
      }));
    }
    // Se l'email non esiste, NON rivelare nulla: genera comunque options senza allowCredentials
  }

  const options = await generateAuthenticationOptions({
    rpID: env.WEBAUTHN_RP_ID,
    allowCredentials,
    userVerification: "preferred",
  });

  await env.DB.prepare(
    `INSERT INTO webauthn_challenges (challenge, user_id, email, type, expires_at) VALUES (?, ?, ?, 'authentication', ?)`
  )
    .bind(options.challenge, userId, email ?? null, Date.now() + CHALLENGE_TTL_MS)
    .run();

  return new Response(JSON.stringify({ ok: true, options }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

export async function handleWebAuthnAuthenticateVerify(
  request: Request,
  env: Env
): Promise<Response> {
  const cors = corsHeaders(request, env);
  const body = (await request.json().catch(() => null)) as {
    response?: AuthenticationResponseJSON;
  } | null;

  if (!body?.response) {
    return new Response(JSON.stringify({ ok: false, error: "missing_response" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const expectedChallenge = JSON.parse(
    new TextDecoder().decode(b64urlDecode(body.response.response.clientDataJSON))
  ).challenge as string;

  const challengeRow = await env.DB.prepare(
    `SELECT user_id FROM webauthn_challenges WHERE challenge = ? AND type = 'authentication' AND expires_at > ?`
  )
    .bind(expectedChallenge, Date.now())
    .first<{ user_id: string | null }>();

  if (!challengeRow) {
    return new Response(JSON.stringify({ ok: false, error: "invalid_challenge" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  await env.DB.prepare(`DELETE FROM webauthn_challenges WHERE challenge = ?`)
    .bind(expectedChallenge)
    .run();

  // Trova la credential dal credential_id ritornato dal browser
  const credRow = await env.DB.prepare(
    `SELECT id, user_id, public_key, counter FROM webauthn_credentials WHERE credential_id = ?`
  )
    .bind(body.response.id)
    .first<{ id: string; user_id: string; public_key: string; counter: number }>();

  if (!credRow) {
    return new Response(JSON.stringify({ ok: false, error: "credential_not_found" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Se il challenge era legato a un user_id specifico, deve combaciare
  if (challengeRow.user_id && challengeRow.user_id !== credRow.user_id) {
    return new Response(JSON.stringify({ ok: false, error: "user_mismatch" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: body.response,
      expectedChallenge,
      expectedOrigin: getExpectedOrigin(request, env),
      expectedRPID: env.WEBAUTHN_RP_ID,
      credential: {
        id: body.response.id,
        publicKey: b64urlDecode(credRow.public_key),
        counter: credRow.counter,
      },
      requireUserVerification: false,
    });
  } catch (err) {
    console.error("[webauthn] authenticate verify failed:", err);
    return new Response(JSON.stringify({ ok: false, error: "verification_failed" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  if (!verification.verified) {
    return new Response(JSON.stringify({ ok: false, error: "not_verified" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Aggiorna counter (replay attack prevention)
  await env.DB.prepare(
    `UPDATE webauthn_credentials SET counter = ?, last_used_at = ? WHERE id = ?`
  )
    .bind(verification.authenticationInfo.newCounter, Date.now(), credRow.id)
    .run();

  // Crea sessione
  const { cookieHeader } = await createSession(env, credRow.user_id, request);

  return new Response(JSON.stringify({ ok: true, userId: credRow.user_id }), {
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Set-Cookie": cookieHeader,
    },
  });
}

// === GESTIONE CREDENZIALI (lista, rinomina, elimina) ===

export async function handleWebAuthnList(request: Request, env: Env): Promise<Response> {
  const cors = corsHeaders(request, env);
  const user = await getUserFromSession(request, env);
  if (!user) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const rows = await env.DB.prepare(
    `SELECT id, device_name, created_at, last_used_at FROM webauthn_credentials WHERE user_id = ? ORDER BY created_at DESC`
  )
    .bind(user.userId)
    .all();

  return new Response(JSON.stringify({ ok: true, credentials: rows.results }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

export async function handleWebAuthnDelete(request: Request, env: Env): Promise<Response> {
  const cors = corsHeaders(request, env);
  const user = await getUserFromSession(request, env);
  if (!user) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const url = new URL(request.url);
  const credId = url.searchParams.get("id");
  if (!credId) {
    return new Response(JSON.stringify({ ok: false, error: "id_required" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  await env.DB.prepare(`DELETE FROM webauthn_credentials WHERE id = ? AND user_id = ?`)
    .bind(credId, user.userId)
    .run();

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
