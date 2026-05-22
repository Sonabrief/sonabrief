import type { Env } from './env'
import disposableDomains from 'disposable-email-domains'

const DISPOSABLE_DOMAINS = new Set(disposableDomains as string[])

// Range di IP datacenter noti (parziali, focalizzati sui maggiori provider cloud)
// In produzione si può espandere con liste più complete
const DATACENTER_IP_PREFIXES = [
  // AWS
  '3.', '13.', '15.', '18.', '34.', '35.', '52.', '54.',
  // Google Cloud
  '34.', '35.', '104.',
  // Microsoft Azure
  '13.', '20.', '40.', '52.', '104.',
  // Hetzner
  '78.46.', '88.99.', '95.216.', '116.202.', '136.243.', '138.201.', '144.76.', '148.251.', '159.69.', '167.235.', '168.119.', '176.9.',
  // DigitalOcean
  '104.131.', '104.236.', '128.199.', '134.122.', '138.197.', '138.68.', '139.59.', '142.93.', '143.110.', '143.198.', '146.190.', '157.230.', '157.245.', '159.65.', '159.89.', '161.35.', '164.90.', '164.92.', '165.227.', '165.232.', '167.71.', '167.99.', '174.138.', '178.62.', '188.166.', '188.226.', '192.241.', '198.199.', '198.211.',
  // Linode
  '50.116.', '66.175.', '69.164.', '72.14.', '74.207.', '96.126.', '139.144.', '170.187.', '172.104.', '173.230.', '173.255.', '178.79.', '192.46.', '192.81.', '198.58.', '198.74.',
  // OVH
  '5.39.', '5.135.', '5.196.', '37.59.', '37.187.', '46.105.', '51.38.', '51.68.', '51.75.', '51.77.', '51.83.', '51.91.', '51.178.', '51.210.', '51.222.', '51.255.', '54.36.', '54.37.', '54.38.', '54.39.', '54.246.', '91.121.', '91.134.', '92.222.', '94.23.', '149.202.', '151.80.', '164.132.', '178.32.', '188.165.', '193.70.', '198.27.', '213.32.', '213.186.', '213.251.', '217.182.',
]

export async function hashIP(ip: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(ip)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('')
}

export function isDisposableEmail(email: string): boolean {
  const domain = email.toLowerCase().split('@')[1]
  if (!domain) return false
  return DISPOSABLE_DOMAINS.has(domain)
}

export function isDatacenterIP(ip: string): boolean {
  return DATACENTER_IP_PREFIXES.some(prefix => ip.startsWith(prefix))
}

interface SignupSignals {
  user_agent: string | null
  accept_language: string | null
  timezone: string | null
  screen_resolution: string | null
}

export async function fingerprint(signals: SignupSignals): Promise<string> {
  const combined = [
    signals.user_agent ?? '',
    signals.accept_language ?? '',
    signals.timezone ?? '',
    signals.screen_resolution ?? '',
  ].join('|')
  const encoder = new TextEncoder()
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(combined))
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('')
}

interface ThrottleCheck {
  allowed: boolean
  reason?: string
}

const DAY_MS = 24 * 60 * 60 * 1000
const MONTH_MS = 30 * DAY_MS

export async function checkAndUpdateIPThrottle(ipHash: string, env: Env): Promise<ThrottleCheck> {
  const now = Date.now()

  const row = await env.DB
    .prepare('SELECT count_24h, count_month, window_24h_start, window_month_start FROM ip_throttle WHERE ip_hash = ?')
    .bind(ipHash)
    .first<{ count_24h: number; count_month: number; window_24h_start: number; window_month_start: number }>()

  if (!row) {
    // Prima occorrenza per questo IP
    await env.DB
      .prepare('INSERT INTO ip_throttle (ip_hash, count_24h, count_month, first_seen_at, last_seen_at, window_24h_start, window_month_start) VALUES (?, 1, 1, ?, ?, ?, ?)')
      .bind(ipHash, now, now, now, now)
      .run()
    return { allowed: true }
  }

  // Reset finestre se scadute
  let count_24h = row.count_24h
  let count_month = row.count_month
  let window_24h_start = row.window_24h_start
  let window_month_start = row.window_month_start

  if (now - row.window_24h_start > DAY_MS) {
    count_24h = 0
    window_24h_start = now
  }
  if (now - row.window_month_start > MONTH_MS) {
    count_month = 0
    window_month_start = now
  }

  // Soglie da PSD: max 3 in 24h, max 5 al mese
  if (count_24h >= 3) {
    return { allowed: false, reason: 'too_many_signups_24h' }
  }
  if (count_month >= 5) {
    return { allowed: false, reason: 'too_many_signups_month' }
  }

  // OK, incrementa contatori
  count_24h += 1
  count_month += 1

  await env.DB
    .prepare('UPDATE ip_throttle SET count_24h = ?, count_month = ?, last_seen_at = ?, window_24h_start = ?, window_month_start = ? WHERE ip_hash = ?')
    .bind(count_24h, count_month, now, window_24h_start, window_month_start, ipHash)
    .run()

  return { allowed: true }
}

export async function recordSignupSignals(
  userId: string,
  ipHash: string,
  signals: SignupSignals,
  fingerprintHash: string,
  env: Env,
): Promise<void> {
  // Check fingerprint collision: stesso fingerprint usato da altri user_id nell'ultimo mese?
  const monthAgo = Date.now() - MONTH_MS
  const collisions = await env.DB
    .prepare('SELECT COUNT(*) as cnt FROM signup_signals WHERE fingerprint_hash = ? AND created_at > ? AND user_id != ?')
    .bind(fingerprintHash, monthAgo, userId)
    .first<{ cnt: number }>()

  const flagged = (collisions?.cnt ?? 0) >= 1 ? 1 : 0
  const flag_reason = flagged ? 'fingerprint_collision' : null

  await env.DB
    .prepare('INSERT INTO signup_signals (user_id, ip_hash, user_agent, accept_language, timezone, screen_resolution, fingerprint_hash, flagged, flag_reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(userId, ipHash, signals.user_agent, signals.accept_language, signals.timezone, signals.screen_resolution, fingerprintHash, flagged, flag_reason, Date.now())
    .run()
}

// === WHITELIST ===

/** ASN aziendali trusted (Autonomous System Numbers).
 * Aggiunti via PR quando un cliente Enterprise richiede whitelist della propria rete.
 * Cloudflare passa request.cf.asn nativamente — zero costo API esterne.
 */
const TRUSTED_ASNS = new Set<number>([
  16509,  // Amazon AWS (include WorkSpaces — utenti remoti su VM)
  14618,  // Amazon AWS (range secondario)
  15169,  // Google Cloud / Workspace
  8075,   // Microsoft (Azure + M365)
  13335,  // Cloudflare (Zero Trust enterprise)
  396982, // Google Cloud (range secondario)
])

export function isTrustedASN(asn: number | undefined): boolean {
  if (asn === undefined) return false
  return TRUSTED_ASNS.has(asn)
}

export async function isUserWhitelisted(userId: string, env: Env): Promise<boolean> {
  const row = await env.DB
    .prepare('SELECT user_id FROM user_whitelist WHERE user_id = ?')
    .bind(userId)
    .first()
  return row !== null
}

export async function addUserToWhitelist(
  userId: string,
  reason: 'payment_auto' | 'admin_override',
  env: Env,
  options?: { grantedBy?: string; notes?: string },
): Promise<void> {
  await env.DB
    .prepare(`
      INSERT INTO user_whitelist (user_id, reason, granted_by, granted_at, notes)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        reason = excluded.reason,
        granted_by = excluded.granted_by,
        granted_at = excluded.granted_at,
        notes = excluded.notes
    `)
    .bind(userId, reason, options?.grantedBy ?? null, Date.now(), options?.notes ?? null)
    .run()
}

export async function removeUserFromWhitelist(userId: string, env: Env): Promise<void> {
  await env.DB
    .prepare('DELETE FROM user_whitelist WHERE user_id = ?')
    .bind(userId)
    .run()
}
