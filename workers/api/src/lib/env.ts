// Tipo dell'ambiente Cloudflare Worker.
// Tutti i binding D1/R2/secrets/vars passano da qui.

export interface Env {
  // D1
  DB: D1Database;

  // R2
  BLOBS: R2Bucket;

  // Secrets
  RESEND_API_KEY: string;
  GROQ_API_KEY: string;
  MISTRAL_API_KEY: string;

  // Google OAuth
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;

  // Microsoft OAuth
  MICROSOFT_CLIENT_ID: string;
  MICROSOFT_CLIENT_SECRET: string;

  // Lemon Squeezy
  LEMONSQUEEZY_API_KEY: string;
  LEMONSQUEEZY_WEBHOOK_SECRET: string;
  LEMONSQUEEZY_STORE_ID: string;
  LEMONSQUEEZY_VARIANT_PRO_MONTHLY: string;
  LEMONSQUEEZY_VARIANT_PRO_ANNUAL: string;
  LEMONSQUEEZY_VARIANT_UNLIMITED_MONTHLY: string;
  LEMONSQUEEZY_VARIANT_UNLIMITED_ANNUAL: string;

}