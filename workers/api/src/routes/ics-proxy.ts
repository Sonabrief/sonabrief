import type { Env } from '../lib/env'
import { getUserFromSession } from '../lib/sessions'

// Proxy ICS stateless: scarica un feed calendario pubblicato (es. "Pubblica
// calendario" di Outlook) e ne restituisce il testo grezzo al client, che farà
// il parsing.
//
// SICUREZZA — un endpoint che fa fetch di URL forniti dal client è un vettore
// SSRF. Difese:
//   - allowlist STRETTA di hostname esatti (i 3 domini ufficiali sotto)
//   - solo https:, nessun credential nell'URL, porta solo 443/vuota
//   - nessun redirect seguito (un 3xx potrebbe puntare fuori allowlist)
//   - timeout 10s, cap 5MB
//   - stateless: niente D1/R2, niente log dell'URL, errori generici al client
//
// Nota runtime: su Cloudflare Workers non è possibile risolvere il DNS prima
// del fetch, quindi la classica difesa "risolvi-poi-valida l'IP" non si applica.
// L'allowlist di hostname ESATTI è la difesa: l'attaccante non controlla il DNS
// di questi domini, e bloccando sottodomini/IP-literal/credenziali si evita
// l'host masquerading.

const ALLOWED_HOSTS = new Set([
  'outlook.office365.com',
  'outlook.office.com',
  'calendar.google.com',
])

// Feed Outlook pubblicati grandi hanno TTFB molto alto (misurato ~26s per ~10MB);
// 30s copre questi casi. Limite del proxy sincrono — vedi PSD.
const FETCH_TIMEOUT_MS = 30_000
// Copre feed reali ~10-12MB con margine, resta lontano dal limite 128MB RAM del Worker.
const MAX_BODY_BYTES = 15 * 1024 * 1024

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function handleIcsProxy(req: Request, env: Env): Promise<Response> {
  // 1. AUTH
  const session = await getUserFromSession(req, env)
  if (!session) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
  }

  // 2. INPUT
  let input: unknown
  try {
    const parsed = (await req.json()) as { url?: unknown }
    input = parsed?.url
  } catch {
    return json(400, { error: 'invalid request' })
  }
  if (typeof input !== 'string' || input.length === 0) {
    return json(400, { error: 'invalid request' })
  }

  // 3. VALIDAZIONE URL (anti-SSRF). Ordine: parse → protocol → credentials →
  //    hostname allowlist → port. Tutti devono passare prima di QUALSIASI fetch.
  let target: URL
  try {
    target = new URL(input)
  } catch {
    return json(400, { error: 'invalid url' })
  }

  if (target.protocol !== 'https:') {
    return json(403, { error: 'url not allowed' })
  }

  if (target.username !== '' || target.password !== '') {
    return json(403, { error: 'url not allowed' })
  }

  // Match ESATTO sull'hostname lowercase: niente endsWith/includes, niente
  // sottodomini. (URL espone già l'hostname senza porta.)
  const host = target.hostname.toLowerCase()
  if (!ALLOWED_HOSTS.has(host)) {
    return json(403, { error: 'url not allowed' })
  }

  // Porta: solo default (vuota) o 443 esplicita.
  if (target.port !== '' && target.port !== '443') {
    return json(403, { error: 'url not allowed' })
  }

  // Difesa in profondità: reject esplicito di IP-literal (IPv4/IPv6).
  if (/^\[.*\]$/.test(target.hostname) || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    return json(403, { error: 'url not allowed' })
  }

  // 4. FETCH — solo dopo che tutti i check sono passati.
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  let upstream: Response
  try {
    upstream = await fetch(target.toString(), {
      method: 'GET',
      redirect: 'manual', // NON seguire redirect: potrebbero puntare fuori allowlist
      signal: controller.signal,
      headers: { Accept: 'text/calendar, text/plain, */*' },
    })
  } catch {
    // Include timeout/abort ed errori di rete. Messaggio generico: l'errore raw
    // potrebbe contenere host o dettagli sensibili.
    clearTimeout(timeout)
    return json(502, { error: 'fetch failed' })
  }

  // Nessun redirect ammesso. Con redirect:"manual" un 3xx arriva come risposta
  // (status 3xx) oppure come opaque-redirect (status 0); rifiuta entrambi.
  if (upstream.status === 0 || (upstream.status >= 300 && upstream.status < 400)) {
    clearTimeout(timeout)
    return json(502, { error: 'fetch failed' })
  }

  if (!upstream.ok || !upstream.body) {
    clearTimeout(timeout)
    return json(502, { error: 'fetch failed' })
  }

  // Lettura con cap a 5MB: leggi a chunk, aborta se si supera il limite.
  const reader = upstream.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        total += value.byteLength
        if (total > MAX_BODY_BYTES) {
          await reader.cancel()
          controller.abort()
          clearTimeout(timeout)
          return json(413, { error: 'too_large' })
        }
        chunks.push(value)
      }
    }
  } catch {
    clearTimeout(timeout)
    return json(502, { error: 'fetch failed' })
  } finally {
    clearTimeout(timeout)
  }

  // Riassembla i chunk in un unico buffer e decodifica come testo.
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }
  const text = new TextDecoder('utf-8').decode(out)

  // 6. OUTPUT — testo ICS grezzo. Parsing lato client.
  return new Response(text, {
    status: 200,
    headers: { 'Content-Type': 'text/calendar; charset=utf-8' },
  })
}
