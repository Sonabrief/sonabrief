import type { Env } from "../lib/env";
import { addUserToWhitelist } from "../lib/antiabuse";

const EXTRA_MINUTES_MAP: Record<string, number> = {
  'fb6c1a92-1d5c-4ea6-b683-f5b324bc437b': 300,
  'da7239fb-c3a7-4cff-a71d-77a0e1b257da': 900,
  '5d1207b4-2369-417e-9cd4-eb3dd3300569': 2400,
  'e79cd9b0-9250-4b98-ab14-ab07ebaefe4d': 480,
  '8d896b13-374f-488e-a1f2-c62be8379872': 1200,
  'eb9825af-0dd4-4278-bca9-9b0f1cf6fd04': 3300,
}

function currentMonth(): string {
  const now = new Date()
  const yyyy = now.getUTCFullYear()
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  return `${yyyy}-${mm}`
}

async function verifyPolarSignature(
  rawBody: string,
  signature: string | null,
  secret: string,
): Promise<boolean> {
  if (!signature) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const computed = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  const computedHex = [...new Uint8Array(computed)]
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
  if (computedHex.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < computedHex.length; i++) {
    mismatch |= computedHex.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0;
}

function tierFromProductId(productId: string, env: Env): { tier: "pro" | "unlimited"; cycle: "monthly" | "annual" } | null {
  if (productId === env.POLAR_PRODUCT_PRO_MONTHLY) return { tier: "pro", cycle: "monthly" };
  if (productId === env.POLAR_PRODUCT_PRO_ANNUAL) return { tier: "pro", cycle: "annual" };
  if (productId === env.POLAR_PRODUCT_UNLIMITED_MONTHLY) return { tier: "unlimited", cycle: "monthly" };
  if (productId === env.POLAR_PRODUCT_UNLIMITED_ANNUAL) return { tier: "unlimited", cycle: "annual" };
  return null;
}

export async function handlePolarWebhook(req: Request, env: Env): Promise<Response> {
  const rawBody = await req.text();
  const signature = req.headers.get("webhook-signature");

  const valid = await verifyPolarSignature(rawBody, signature, env.POLAR_WEBHOOK_SECRET);
  if (!valid) {
    console.warn("[webhook-polar] invalid signature");
    return new Response(JSON.stringify({ error: "invalid_signature" }), { status: 401 });
  }

  let payload: { type: string; data: Record<string, any> };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), { status: 400 });
  }

  const eventType = payload.type;
  const eventId = req.headers.get("webhook-id") ?? `${eventType}-${Date.now()}`;

  const existing = await env.DB
    .prepare("SELECT event_id FROM webhook_events WHERE event_id = ?")
    .bind(eventId)
    .first();
  if (existing) {
    return new Response(JSON.stringify({ ok: true, duplicate: true }), { status: 200 });
  }

  try {
    await processPolarEvent(eventType, payload.data, env);
  } catch (err) {
    console.error("[webhook-polar] processing error:", err);
    return new Response(JSON.stringify({ error: "processing_failed" }), { status: 500 });
  }

  await env.DB
    .prepare("INSERT INTO webhook_events (event_id, event_name, processed_at) VALUES (?, ?, ?)")
    .bind(eventId, eventType, Date.now())
    .run();

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}

async function processPolarEvent(eventType: string, data: Record<string, any>, env: Env): Promise<void> {
  const userId = data.metadata?.user_id;
  const productId = data.product_id ?? data.product?.id;
  const subscriptionId = data.id;

  switch (eventType) {
    case "subscription.created":
    case "subscription.updated": {
      if (!userId) { console.warn("[webhook-polar] missing user_id in metadata"); return; }
      const plan = tierFromProductId(productId, env);
      if (!plan) { console.warn("[webhook-polar] unknown product_id:", productId); return; }

      const status = data.status === "active" ? "active" : data.status;
      const renewsAt = data.current_period_end ? new Date(data.current_period_end).getTime() : null;
      const now = Date.now();

      await env.DB.prepare(`
        INSERT INTO licenses (id, user_id, tier, status, polar_subscription_id, billing_cycle, renews_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          tier = excluded.tier, status = excluded.status,
          polar_subscription_id = excluded.polar_subscription_id,
          billing_cycle = excluded.billing_cycle,
          renews_at = excluded.renews_at,
          updated_at = excluded.updated_at
      `).bind(crypto.randomUUID(), userId, plan.tier, status, subscriptionId, plan.cycle, renewsAt, now, now).run();

      // Auto-whitelist: utente pagante bypassa controlli anti-abuse al re-login
      if (status === "active") {
        await addUserToWhitelist(userId, "payment_auto", env, {
          notes: `Tier ${plan.tier} ${plan.cycle}`,
        })
      }
      break;
    }
    case "subscription.canceled":
    case "subscription.revoked": {
      const endsAt = data.ends_at ? new Date(data.ends_at).getTime() : null;
      await env.DB.prepare(`
        UPDATE licenses SET status = 'cancelled', cancelled_at = ?, ends_at = ?, updated_at = ?
        WHERE polar_subscription_id = ?
      `).bind(Date.now(), endsAt, Date.now(), subscriptionId).run();
      break;
    }
    case "order.created": {
      if (!userId) { console.warn("[webhook-polar] order.created: missing user_id in metadata"); return; }
      const minutes = EXTRA_MINUTES_MAP[productId];
      if (!minutes) { console.warn("[webhook-polar] order.created: unknown product_id:", productId); return; }
      const month = currentMonth();
      const now = Date.now();
      await env.DB.prepare(`
        INSERT INTO cloud_transcription_usage (id, user_id, month, minutes_used, extra_minutes_purchased, last_updated)
        VALUES (?, ?, ?, 0, ?, ?)
        ON CONFLICT(user_id, month) DO UPDATE SET
          extra_minutes_purchased = extra_minutes_purchased + ?,
          last_updated = excluded.last_updated
      `).bind(crypto.randomUUID(), userId, month, minutes, now, minutes).run();
      console.log(`[webhook-polar] order.created: +${minutes} min for user ${userId} in ${month}`);
      break;
    }
    default:
      console.log("[webhook-polar] unhandled event:", eventType);
  }
}
