// Tipo dell'ambiente Cloudflare Worker.
// Tutti i binding D1/R2/secrets/vars passano da qui.

export interface Env {
  // D1
  DB: D1Database;

  // Secrets
  RESEND_API_KEY: string;
  GROQ_API_KEY: string;
  MISTRAL_API_KEY: string;

  // Vars
  APP_URL: string;
}