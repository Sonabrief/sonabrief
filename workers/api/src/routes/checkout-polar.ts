import { z } from "zod";
import type { Env } from "../lib/env";
import { getUserFromSession } from "../lib/sessions";

const CheckoutRequestSchema = z.object({
  tier: z.enum(["pro_monthly", "pro_annual", "unlimited_monthly", "unlimited_annual"]),
});

function productIdForTier(tier: string, env: Env): string {
  switch (tier) {
    case "pro_monthly": return env.POLAR_PRODUCT_PRO_MONTHLY;
    case "pro_annual": return env.POLAR_PRODUCT_PRO_ANNUAL;
    case "unlimited_monthly": return env.POLAR_PRODUCT_UNLIMITED_MONTHLY;
    case "unlimited_annual": return env.POLAR_PRODUCT_UNLIMITED_ANNUAL;
    default: throw new Error("invalid tier");
  }
}

export async function handlePolarCheckout(req: Request, env: Env): Promise<Response> {
  const session = await getUserFromSession(req, env);
  if (!session) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = CheckoutRequestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "invalid_tier" }), { status: 400 });
  }

  const userRow = await env.DB
    .prepare("SELECT email FROM users WHERE id = ?")
    .bind(session.userId)
    .first<{ email: string }>();
  if (!userRow) {
    return new Response(JSON.stringify({ error: "user_not_found" }), { status: 404 });
  }

  const productId = productIdForTier(parsed.data.tier, env);

  const polarRes = await fetch("https://api.polar.sh/v1/checkouts/", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.POLAR_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      product_id: productId,
      customer_email: userRow.email,
      metadata: {
        user_id: session.userId,
        tier: parsed.data.tier,
      },
      success_url: "https://sonabrief.com/billing/success",
    }),
  });

  if (!polarRes.ok) {
    const errorText = await polarRes.text();
    console.error("[checkout-polar] error:", polarRes.status, errorText);
    return new Response(JSON.stringify({ error: "checkout_failed" }), { status: 502 });
  }

  const data = await polarRes.json() as { url: string };
  return new Response(JSON.stringify({ url: data.url }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
