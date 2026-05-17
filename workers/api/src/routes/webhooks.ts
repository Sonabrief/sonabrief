import type { Env } from '../lib/env'

// Verifica firma HMAC SHA256 del webhook Lemon Squeezy.
// Confronto timing-safe per prevenire timing attacks.
async function verifySignature(
  rawBody: string,
  signature: string | null,
  secret: string,
): Promise<boolean> {
  if (!signature) return false

  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const computed = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody))
  const computedHex = [...new Uint8Array(computed)]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  if (computedHex.length !== signature.length) return false
  let mismatch = 0
  for (let i = 0; i < computedHex.length; i++) {
    mismatch |= computedHex.charCodeAt(i) ^ signature.charCodeAt(i)
  }
  return mismatch === 0
}

function planFromVariant(variantId: string, env: Env): { tier: 'pro' | 'unlimited'; cycle: 'monthly' | 'annual' } | null {
  if (variantId === env.LEMONSQUEEZY_VARIANT_PRO_MONTHLY) return { tier: 'pro', cycle: 'monthly' }
  if (variantId === env.LEMONSQUEEZY_VARIANT_PRO_ANNUAL) return { tier: 'pro', cycle: 'annual' }
  if (variantId === env.LEMONSQUEEZY_VARIANT_UNLIMITED_MONTHLY) return { tier: 'unlimited', cycle: 'monthly' }
  if (variantId === env.LEMONSQUEEZY_VARIANT_UNLIMITED_ANNUAL) return { tier: 'unlimited', cycle: 'annual' }
  return null
}

interface LSWebhookPayload {
  meta: {
    event_name: string
    custom_data?: { user_id?: string; tier?: string }
  }
  data: {
    id: string
    type: string
    attributes: Record<string, unknown>
  }
}

export async function handleLemonsqueezyWebhook(
  req: Request,
  env: Env,
): Promise<Response> {
  const rawBody = await req.text()
  const signature = req.headers.get('X-Signature')

  const valid = await verifySignature(rawBody, signature, env.LEMONSQUEEZY_WEBHOOK_SECRET)
  if (!valid) {
    console.warn('[webhook] invalid signature')
    return new Response(JSON.stringify({ error: 'invalid_signature' }), { status: 401 })
  }

  let payload: LSWebhookPayload
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), { status: 400 })
  }

  const eventName = payload.meta?.event_name
  const eventId = req.headers.get('X-Event-Id') ?? `${eventName}-${payload.data?.id}-${Date.now()}`
  if (!eventName) {
    return new Response(JSON.stringify({ error: 'missing_event_name' }), { status: 400 })
  }

  // Idempotenza: già processato?
  const existing = await env.DB
    .prepare('SELECT event_id FROM webhook_events WHERE event_id = ?')
    .bind(eventId)
    .first()
  if (existing) {
    console.log('[webhook] duplicate event, skipping:', eventId)
    return new Response(JSON.stringify({ ok: true, duplicate: true }), { status: 200 })
  }

  try {
    await processEvent(payload, env)
  } catch (err) {
    console.error('[webhook] processing error:', err)
    // Non marchiamo come processato: LS riproverà
    return new Response(JSON.stringify({ error: 'processing_failed' }), { status: 500 })
  }

  // Marca come processato
  await env.DB
    .prepare('INSERT INTO webhook_events (event_id, event_name, processed_at) VALUES (?, ?, ?)')
    .bind(eventId, eventName, Date.now())
    .run()

  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processEvent(payload: LSWebhookPayload, env: Env): Promise<void> {
  const eventName = payload.meta.event_name
  const userId = payload.meta.custom_data?.user_id
  const attrs = payload.data.attributes as Record<string, any>

  switch (eventName) {
    case 'subscription_created':
    case 'subscription_resumed':
    case 'subscription_unpaused':
    case 'subscription_updated':
    case 'subscription_payment_success': {
      if (!userId) {
        console.warn('[webhook] missing user_id in custom_data, event:', eventName)
        return
      }
      const variantId = String(attrs.variant_id ?? '')
      const plan = planFromVariant(variantId, env)
      if (!plan) {
        console.warn('[webhook] unknown variant_id:', variantId)
        return
      }

      const renewsAt = attrs.renews_at ? new Date(attrs.renews_at as string).getTime() : null
      const endsAt = attrs.ends_at ? new Date(attrs.ends_at as string).getTime() : null
      const status = String(attrs.status ?? 'active')

      // Upsert: una sola licenza attiva per user_id
      await env.DB
        .prepare(`
          INSERT INTO licenses (
            user_id, tier, billing_cycle, status,
            ls_subscription_id, ls_customer_id, ls_variant_id, ls_order_id,
            renews_at, ends_at, cancelled_at, updated_at,
            period_start, period_end
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET
            tier = excluded.tier,
            billing_cycle = excluded.billing_cycle,
            status = excluded.status,
            ls_subscription_id = excluded.ls_subscription_id,
            ls_customer_id = excluded.ls_customer_id,
            ls_variant_id = excluded.ls_variant_id,
            renews_at = excluded.renews_at,
            ends_at = excluded.ends_at,
            cancelled_at = NULL,
            updated_at = excluded.updated_at
        `)
        .bind(
          userId, plan.tier, plan.cycle, status,
          String(payload.data.id),
          String(attrs.customer_id ?? ''),
          variantId,
          String(attrs.order_id ?? ''),
          renewsAt,
          endsAt,
          Date.now(),
          Date.now(),
          renewsAt,
        )
        .run()
      break
    }

    case 'subscription_cancelled': {
      // Cancellata ma resta attiva fino a ends_at
      const subscriptionId = String(payload.data.id)
      const endsAt = attrs.ends_at ? new Date(attrs.ends_at as string).getTime() : null
      await env.DB
        .prepare(`
          UPDATE licenses
          SET status = 'cancelled', cancelled_at = ?, ends_at = ?, updated_at = ?
          WHERE ls_subscription_id = ?
        `)
        .bind(Date.now(), endsAt, Date.now(), subscriptionId)
        .run()
      break
    }

    case 'subscription_expired':
    case 'subscription_paused': {
      // Decade a free
      const subscriptionId = String(payload.data.id)
      await env.DB
        .prepare(`
          UPDATE licenses
          SET tier = 'free', status = ?, updated_at = ?
          WHERE ls_subscription_id = ?
        `)
        .bind(eventName === 'subscription_expired' ? 'expired' : 'paused', Date.now(), subscriptionId)
        .run()
      break
    }

    case 'subscription_payment_failed': {
      const subscriptionId = String(payload.data.id)
      await env.DB
        .prepare(`UPDATE licenses SET status = 'payment_failed', updated_at = ? WHERE ls_subscription_id = ?`)
        .bind(Date.now(), subscriptionId)
        .run()
      break
    }

    case 'order_refunded': {
      const orderId = String(payload.data.id)
      await env.DB
        .prepare(`
          UPDATE licenses
          SET tier = 'free', status = 'refunded', updated_at = ?
          WHERE ls_order_id = ?
        `)
        .bind(Date.now(), orderId)
        .run()
      break
    }

    case 'order_created':
      // No-op: gestiamo tutto via subscription_created
      break

    default:
      console.log('[webhook] unhandled event:', eventName)
  }
}
