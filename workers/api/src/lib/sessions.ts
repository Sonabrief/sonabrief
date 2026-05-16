import type { Env } from "./env";

const SESSION_COOKIE = "sb_session";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30; // 30 giorni
const SLIDING_REFRESH_MS = 1000 * 60 * 60 * 24; // estendi se ultima attività >1 giorno fa

export interface SessionUser {
  userId: string;
  sessionId: string;
}

/**
 * Crea una nuova sessione per l'utente e ritorna il valore del cookie da impostare.
 */
export async function createSession(
  env: Env,
  userId: string,
  request: Request
): Promise<{ sessionId: string; cookieHeader: string }> {
  const sessionId = crypto.randomUUID();
  const now = Date.now();
  const expiresAt = now + SESSION_DURATION_MS;

  const ipHash = await hashIp(request);
  const userAgent = request.headers.get("User-Agent")?.slice(0, 255) ?? null;

  await env.DB.prepare(
    `INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen_at, ip_hash, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(sessionId, userId, now, expiresAt, now, ipHash, userAgent)
    .run();

  return {
    sessionId,
    cookieHeader: buildCookie(sessionId, expiresAt, env),
  };
}

/**
 * Estrae il session_id dal cookie, valida contro DB, applica sliding window.
 * Ritorna null se non autenticato o scaduto.
 */
export async function getUserFromSession(
  request: Request,
  env: Env
): Promise<SessionUser | null> {
  const sessionId = readSessionCookie(request);
  if (!sessionId) return null;

  const now = Date.now();
  const row = await env.DB.prepare(
    `SELECT user_id, expires_at, last_seen_at
     FROM sessions WHERE id = ? AND expires_at > ?`
  )
    .bind(sessionId, now)
    .first<{ user_id: string; expires_at: number; last_seen_at: number | null }>();

  if (!row) return null;

  // Sliding window: aggiorna last_seen_at e estendi expires_at se l'ultima
  // attività è più vecchia di 1 giorno (evitiamo write a ogni richiesta)
  const lastSeen = row.last_seen_at ?? 0;
  if (now - lastSeen > SLIDING_REFRESH_MS) {
    const newExpiresAt = now + SESSION_DURATION_MS;
    await env.DB.prepare(
      `UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?`
    )
      .bind(now, newExpiresAt, sessionId)
      .run();
  }

  return { userId: row.user_id, sessionId };
}

/** Invalida una sessione specifica (logout) */
export async function destroySession(
  env: Env,
  sessionId: string
): Promise<string> {
  await env.DB.prepare(`DELETE FROM sessions WHERE id = ?`).bind(sessionId).run();
  return clearCookie(env);
}

/** Invalida tutte le sessioni dell'utente (logout from all devices) */
export async function destroyAllUserSessions(
  env: Env,
  userId: string
): Promise<void> {
  await env.DB.prepare(`DELETE FROM sessions WHERE user_id = ?`).bind(userId).run();
}

// --- Cookie helpers ---

function buildCookie(sessionId: string, expiresAt: number, env: Env): string {
  const isDev = env.APP_URL.includes("localhost");
  const parts = [
    `${SESSION_COOKIE}=${sessionId}`,
    `Path=/`,
    `Expires=${new Date(expiresAt).toUTCString()}`,
    `HttpOnly`,
    `SameSite=${isDev ? "Lax" : "None"}`,
  ];
  if (!isDev) parts.push(`Secure`);
  return parts.join("; ");
}

function clearCookie(env: Env): string {
  const isDev = env.APP_URL.includes("localhost");
  const parts = [
    `${SESSION_COOKIE}=`,
    `Path=/`,
    `Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
    `HttpOnly`,
    `SameSite=${isDev ? "Lax" : "None"}`,
  ];
  if (!isDev) parts.push(`Secure`);
  return parts.join("; ");
}

function readSessionCookie(request: Request): string | null {
  const cookieHeader = request.headers.get("Cookie");
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) return rest.join("=");
  }
  return null;
}

// --- Privacy: hash IP for storage (no plain IP saved) ---

async function hashIp(request: Request): Promise<string | null> {
  const ip =
    request.headers.get("CF-Connecting-IP") ??
    request.headers.get("X-Forwarded-For") ??
    null;
  if (!ip) return null;

  const data = new TextEncoder().encode(ip);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}