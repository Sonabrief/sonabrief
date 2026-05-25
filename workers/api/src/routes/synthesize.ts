import { z } from "zod";
import { getUserFromSession } from "../lib/sessions";
import { checkQuotaAndBudget, logSynthesisAndUpdateBudget, checkBudgetCap } from "../quota";
import { synthesizeWithRouting } from "../providers";
import { checkUnlimitedThresholds } from "../lib/unlimited-thresholds";
import type { Env } from "../lib/env";

const BUDGET_CAP_USD = 30; // fase 1-2, PSD v2.0

const QUOTA_CAP: Record<"free" | "pro" | "unlimited", number | null> = {
  free: 180,
  pro: 3000,
  unlimited: null,
};

function currentMonth(): string {
  const d = new Date();
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}

const SynthesizeSchema = z.object({
  transcript: z.string().min(10).max(100_000),
  template_id: z.string().optional(),
  language: z.enum(["it", "en", "fr", "es", "de"]).default("it"),
  meeting_id: z.string().uuid(),
  system_prompt: z.string().min(10).max(10_000),
  audio_minutes: z.number().min(0).default(0),
  notes: z.string().max(10_000).optional(),
  mode: z.enum(['standard', 'local']).default('standard'),
});

function buildSystemPrompt(base: string, prefs: {
  profession: string | null
  profession_category: string | null
  context_note: string | null
  meeting_duration: string | null
} | null): string {
  if (!prefs || (!prefs.profession && !prefs.context_note)) return base

  const lines: string[] = []

  if (prefs.profession) {
    lines.push(`L'utente è un/una ${prefs.profession}.`)
  }
  if (prefs.context_note) {
    lines.push(`Contesto professionale: ${prefs.context_note}`)
  }
  if (prefs.meeting_duration === 'short') {
    lines.push('I meeting sono tipicamente brevi (< 30 minuti): produci una sintesi molto compatta.')
  } else if (prefs.meeting_duration === 'very_long') {
    lines.push('I meeting sono tipicamente lunghi (> 2 ore): struttura la sintesi in sezioni ben definite.')
  }

  const contextPrefix = lines.join(' ')
  return `${contextPrefix}\n\n${base}`
}

export async function handleSynthesize(req: Request, env: Env): Promise<Response> {
  // 1. Auth
  const session = await getUserFromSession(req, env);
  if (!session) return new Response("Unauthorized", { status: 401 });

  // 2. Tier utente da DB
  const licenseRow = await env.DB.prepare(
    `SELECT tier FROM licenses WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1`
  )
    .bind(session.userId)
    .first<{ tier: string }>();
  const tier = (licenseRow?.tier ?? "free") as "free" | "pro" | "unlimited";

  const userPrefs = await env.DB
    .prepare('SELECT profession, profession_category, context_note, meeting_duration, synthesis_mode FROM user_preferences WHERE user_id = ?')
    .bind(session.userId)
    .first<{
      profession: string | null
      profession_category: string | null
      context_note: string | null
      meeting_duration: string | null
      synthesis_mode: string | null
    }>()

  // 3. Zod validation
  let body: z.infer<typeof SynthesizeSchema>;
  try {
    body = SynthesizeSchema.parse(await req.json());
  } catch (e) {
    return new Response(JSON.stringify({ error: "invalid_input" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const finalSystemPrompt = buildSystemPrompt(body.system_prompt ?? '', userPrefs)

  // 4. Budget cap globale (solo free, solo cloud)
  if (tier === 'free' && body.mode !== 'local') {
    const budget = await checkBudgetCap(env)
    if (!budget.ok) {
      return new Response(JSON.stringify({
        error: 'budget_cap_reached',
        message: 'Il budget mensile gratuito è esaurito. Passa a Pro per accesso illimitato o usa la modalità Local Only (gira sul tuo computer, sempre disponibile).',
        cost_usd: budget.cost_usd,
        cap_usd: budget.cap_usd,
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  // 5. Quota mensile per tier (solo cloud)
  if (body.mode !== 'local') {
    const cap = QUOTA_CAP[tier];
    if (cap !== null) {
      const month = currentMonth();
      const quotaRow = await env.DB
        .prepare('SELECT synthesis_minutes FROM quota WHERE user_id = ? AND month = ?')
        .bind(session.userId, month)
        .first<{ synthesis_minutes: number }>();
      const consumed = quotaRow?.synthesis_minutes ?? 0;
      if (consumed + body.audio_minutes > cap) {
        return new Response(
          JSON.stringify({
            error: 'quota_exceeded',
            tier,
            consumed,
            cap,
            audio_minutes: body.audio_minutes,
            message: 'Hai raggiunto il limite mensile di sintesi cloud. Passa a Pro o usa la modalità Local Only.',
          }),
          { status: 429, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }
  }

  // 5. Quota + budget check
  const check = await checkQuotaAndBudget(
    env.DB,
    session.userId,
    tier,
    body.audio_minutes,
    BUDGET_CAP_USD
  );

  if (!check.allowed) {
    const status = check.reason === "budget_cap_reached" ? 503 : 429;
    return new Response(
      JSON.stringify({ error: check.reason, hint: "local_mode" }),
      { status, headers: { "Content-Type": "application/json" } }
    );
  }

  // 6. Flag check (soft enforcement)
  const signupRow = await env.DB
    .prepare('SELECT flagged FROM signup_signals WHERE user_id = ?')
    .bind(session.userId)
    .first<{ flagged: number }>()
  const isFlagged = signupRow?.flagged === 1

  // 7. Local Only placeholder
  if (body.mode === 'local') {
    const msg = JSON.stringify({ type: 'error', message: 'Local Only non ancora disponibile in questa versione. Installa Ollama e riprova.' });
    return new Response(`data: ${msg}\n\n`, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  }

  // 6. SSE streaming (standard)
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  const write = (data: object) =>
    writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

  (async () => {
    try {
      // Soft enforcement: account flagged at signup get artificial latency.
      // Visible-failure-free, makes the service feel slow without alerting the user. PSD section E.
      if (isFlagged && body.mode !== 'local') {
        const delayMs = 8000 + Math.floor(Math.random() * 7000)
        await new Promise(resolve => setTimeout(resolve, delayMs))
      }

      const result = await synthesizeWithRouting(
        tier,
        {
          systemPrompt: finalSystemPrompt,
          transcript: body.transcript,
          language: body.language,
          notes: body.notes || undefined,
        },
        env,
        (chunk) => {
          write({ type: "chunk", text: chunk.text });
        }
      );

      await write({ type: "done", meeting_id: body.meeting_id });

      // 6. Log + aggiorna budget
      try {
        await logSynthesisAndUpdateBudget(
          env.DB,
          {
            userId: session.userId,
            templateId: body.template_id ?? null,
            provider: result.providerUsed,
            model: result.modelUsed,
            audioMinutes: body.audio_minutes,
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
            costUsd: result.usage.estimatedCostUsd,
            fellBack: result.fellBackToSecondary,
            language: body.language,
            tier,
            mode: body.mode,
          },
          BUDGET_CAP_USD
        );
      } catch (logErr) {
        console.error('[synthesize] logging failed (synthesis already delivered):', logErr)
      }

      try {
        await env.DB
          .prepare(`
            INSERT INTO quota (id, user_id, month, synthesis_minutes, synthesis_count, storage_bytes, updated_at)
            VALUES (?, ?, ?, ?, 1, 0, ?)
            ON CONFLICT(user_id, month) DO UPDATE SET
              synthesis_minutes = synthesis_minutes + excluded.synthesis_minutes,
              synthesis_count = synthesis_count + 1,
              updated_at = excluded.updated_at
          `)
          .bind(crypto.randomUUID(), session.userId, currentMonth(), body.audio_minutes, Date.now())
          .run();
      } catch (quotaErr) {
        console.error('[synthesize] quota update failed:', quotaErr);
      }

      // Fire-and-forget: check unlimited thresholds after quota is updated
      ;(async () => {
        try {
          const updatedQuota = await env.DB
            .prepare('SELECT synthesis_minutes FROM quota WHERE user_id = ? AND month = ?')
            .bind(session.userId, currentMonth())
            .first<{ synthesis_minutes: number }>()

          const userRow = await env.DB
            .prepare('SELECT email FROM users WHERE id = ?')
            .bind(session.userId)
            .first<{ email: string }>()

          if (updatedQuota && userRow) {
            await checkUnlimitedThresholds(env, session.userId, userRow.email, tier, updatedQuota.synthesis_minutes)
          }
        } catch (thresholdErr) {
          console.error('[synthesize] unlimited threshold check failed:', thresholdErr)
        }
      })()
    } catch (err) {
      console.error('[synthesize] error:', err)
      await write({ type: "error", message: "synthesis_failed" });
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}