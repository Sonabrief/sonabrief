import type { ModelTier } from "./providers/types";
import type { Env } from "./lib/env";

export const BUDGET_CAP_USD = 30

// Limiti per tier (minuti di audio al mese)
const TIER_QUOTA_MINUTES: Record<ModelTier, number> = {
  free: 180,       // 3h
  pro: 3000,       // 50h
  unlimited: 30000, // 500h (fair use)
};

export interface QuotaCheckResult {
  allowed: boolean;
  reason?: "user_quota_exceeded" | "budget_cap_reached";
  minutesUsedThisMonth: number;
  minutesQuota: number;
}

/** Formato YYYY-MM per chiave mensile */
export function currentMonthKey(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** Timestamp inizio mese UTC corrente (ms) */
export function currentMonthStart(now: Date = new Date()): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
}

/**
 * Verifica se l'utente può fare una sintesi:
 * - quota utente non superata
 * - budget cap globale non raggiunto
 */
export async function checkQuotaAndBudget(
  db: D1Database,
  userId: string,
  tier: ModelTier,
  audioMinutes: number,
  budgetCapUsd: number
): Promise<QuotaCheckResult> {
  const monthStart = currentMonthStart();

  // 1. Minuti già usati dall'utente questo mese
  const usedRow = await db
    .prepare(
      `SELECT COALESCE(SUM(audio_minutes), 0) AS used
       FROM synthesis_log
       WHERE user_id = ? AND created_at >= ?`
    )
    .bind(userId, monthStart)
    .first<{ used: number }>();

  const minutesUsed = usedRow?.used ?? 0;
  const quota = TIER_QUOTA_MINUTES[tier];

  if (minutesUsed + audioMinutes > quota) {
    return {
      allowed: false,
      reason: "user_quota_exceeded",
      minutesUsedThisMonth: minutesUsed,
      minutesQuota: quota,
    };
  }

  // 2. Budget cap globale (USD spesi questo mese)
  const monthKey = currentMonthKey();
  const budgetRow = await db
    .prepare(`SELECT cost_usd FROM budget_usage WHERE month = ?`)
    .bind(monthKey)
    .first<{ cost_usd: number }>();

  const spentUsd = budgetRow?.cost_usd ?? 0;

  if (spentUsd >= budgetCapUsd) {
    return {
      allowed: false,
      reason: "budget_cap_reached",
      minutesUsedThisMonth: minutesUsed,
      minutesQuota: quota,
    };
  }

  return {
    allowed: true,
    minutesUsedThisMonth: minutesUsed,
    minutesQuota: quota,
  };
}

export async function checkBudgetCap(env: Env): Promise<{ ok: true } | { ok: false; cost_usd: number; cap_usd: number }> {
  const month = currentMonthKey()
  const row = await env.DB
    .prepare('SELECT cost_usd, cap_usd FROM budget_usage WHERE month = ?')
    .bind(month)
    .first<{ cost_usd: number; cap_usd: number }>()

  if (!row) {
    await env.DB
      .prepare('INSERT INTO budget_usage (month, cost_usd, cap_usd, updated_at) VALUES (?, 0, ?, ?) ON CONFLICT(month) DO NOTHING')
      .bind(month, BUDGET_CAP_USD, Date.now())
      .run()
    return { ok: true }
  }

  if (row.cost_usd >= row.cap_usd) {
    return { ok: false, cost_usd: row.cost_usd, cap_usd: row.cap_usd }
  }

  return { ok: true }
}

export interface LogSynthesisInput {
  userId: string;
  templateId: string | null;
  provider: string;
  model: string;
  audioMinutes: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  fellBack: boolean;
  language: string;
  tier: string;
  mode: string;
}

/**
 * Registra una sintesi completata e aggiorna il budget mensile.
 * Esegue in un'unica batch atomica.
 */
export async function logSynthesisAndUpdateBudget(
  db: D1Database,
  input: LogSynthesisInput,
  budgetCapUsd: number
): Promise<void> {
  const now = Date.now();
  const monthKey = currentMonthKey();
  const id = crypto.randomUUID();

  await db.batch([
    db
      .prepare(
        `INSERT INTO synthesis_log
         (id, user_id, template_id, provider, model, audio_minutes,
          input_tokens, output_tokens, cost_usd, fell_back, language, created_at,
          tier, mode)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        input.userId,
        input.templateId || null,
        input.provider,
        input.model,
        input.audioMinutes,
        input.inputTokens,
        input.outputTokens,
        input.costUsd,
        input.fellBack ? 1 : 0,
        input.language,
        now,
        input.tier,
        input.mode,
      ),
    db
      .prepare(
        `INSERT INTO budget_usage (month, cost_usd, cap_usd, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(month) DO UPDATE SET
           cost_usd = cost_usd + excluded.cost_usd,
           updated_at = excluded.updated_at`
      )
      .bind(monthKey, input.costUsd, budgetCapUsd, now),
  ]);
}