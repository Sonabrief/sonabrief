import { z } from "zod";
import type { Env } from "../lib/env";
import { getUserFromSession } from "../lib/sessions";

const CheckoutRequestSchema = z.object({
  tier: z.enum(["pro_monthly", "pro_annual", "unlimited_monthly", "unlimited_annual"]),
});

function variantIdForTier(tier: string, env: Env): string {
  switch (tier) {
    case "pro_monthly": return env.LEMONSQUEEZY_VARIANT_PRO_MONTHLY;
    case "pro_annual": return env.LEMONSQUEEZY_VARIANT_PRO_ANNUAL;
    case "unlimited_monthly": return env.LEMONSQUEEZY_VARIANT_UNLIMITED_MONTHLY;
    case "unlimited_annual": return env.LEMONSQUEEZY_VARIANT_UNLIMITED_ANNUAL;
    default: throw new Error("invalid tier");
  }
}

export async function handleCheckout(req: Request, env: Env): Promise<Response> {
  const session = await getUserFromSession(req, env);
  if (!session) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = CheckoutRequestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "invalid_tier" }), { status: 400 });
  }

  const variantId = variantIdForTier(parsed.data.tier, env);
  const storeId = env.LEMONSQUEEZY_STORE_ID;

  const userRow = await env.DB
    .prepare("SELECT email FROM users WHERE id = ?")
    .bind(session.userId)
    .first<{ email: string }>();
  if (!userRow) {
    return new Response(JSON.stringify({ error: "user_not_found" }), { status: 404 });
  }

  const lsResponse = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
    method: "POST",
    headers: {
      "Accept": "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
      "Authorization": `Bearer ${env.LEMONSQUEEZY_API_KEY}`,
    },
    body: JSON.stringify({
      data: {
        type: "checkouts",
        attributes: {
          checkout_data: {
            email: userRow.email,
            custom: {
              user_id: session.userId,
              tier: parsed.data.tier,
            },
          },
          product_options: {
            redirect_url: "https://sonabrief.com/billing/success",
            receipt_button_text: "Return to Sonabrief",
            receipt_link_url: "https://sonabrief.com",
          },
          checkout_options: {
            embed: false,
            dark: false,
          },
        },
        relationships: {
          store: { data: { type: "stores", id: storeId } },
          variant: { data: { type: "variants", id: variantId } },
        },
      },
    }),
  });

  if (!lsResponse.ok) {
    const errorText = await lsResponse.text();
    console.error("[checkout] LS error:", lsResponse.status, errorText);
    return new Response(JSON.stringify({ error: "checkout_failed" }), { status: 502 });
  }

  const data = await lsResponse.json() as { data: { attributes: { url: string } } };
  const checkoutUrl = data.data.attributes.url;

  return new Response(JSON.stringify({ url: checkoutUrl }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
