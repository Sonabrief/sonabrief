import { z } from "zod";
import { getUserFromSession } from "../lib/sessions";
import { checkQuotaAndBudget, logSynthesisAndUpdateBudget } from "../quota";
import { synthesizeWithRouting } from "../providers";
import type { Env } from "../lib/env";

const BUDGET_CAP_USD = 50; // fase 1-2, dal PSD

const SynthesizeSchema = z.object({
  transcript: z.string().min(10).max(100_000),
  template_id: z.string().uuid().optional(),
  language: z.enum(["it", "en", "fr", "es", "de"]).default("it"),
  meeting_id: z.string().uuid(),
  system_prompt: z.string().min(10).max(10_000),
  audio_minutes: z.number().min(0).default(0),
  notes: z.string().max(10_000).optional(),
  mode: z.enum(['standard', 'local']).default('standard'),
});

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

  // 4. Quota + budget check
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

  // 5. Local Only placeholder
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
      const result = await synthesizeWithRouting(
        tier,
        {
          systemPrompt: body.system_prompt,
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
            templateId: body.template_id ?? "none",
            provider: result.providerUsed,
            model: result.modelUsed,
            audioMinutes: body.audio_minutes,
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
            costUsd: result.usage.estimatedCostUsd,
            fellBack: result.fellBackToSecondary,
            language: body.language,
          },
          BUDGET_CAP_USD
        );
      } catch (logErr) {
        console.error('[synthesize] logging failed (synthesis already delivered):', logErr)
      }
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