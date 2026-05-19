import type { Env } from "../lib/env";

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
        INSERT INTO licenses (id, user_id, tier, status, ls_subscription_id, billing_cycle, renews_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          tier = excluded.tier, status = excluded.status,
          ls_subscription_id = excluded.ls_subscription_id,
          billing_cycle = excluded.billing_cycle,
          renews_at = excluded.renews_at,
          updated_at = excluded.updated_at
      `).bind(crypto.randomUUID(), userId, plan.tier, status, subscriptionId, plan.cycle, renewsAt, now, now).run();
      break;
    }
    case "subscription.canceled":
    case "subscription.revoked": {
      const endsAt = data.ends_at ? new Date(data.ends_at).getTime() : null;
      await env.DB.prepare(`
        UPDATE licenses SET status = 'cancelled', cancelled_at = ?, ends_at = ?, updated_at = ?
        WHERE ls_subscription_id = ?
      `).bind(Date.now(), endsAt, Date.now(), subscriptionId).run();
      break;
    }
    default:
      console.log("[webhook-polar] unhandled event:", eventType);
  }
}
