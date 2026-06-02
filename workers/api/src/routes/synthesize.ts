import { z } from "zod";
import { getUserFromSession } from "../lib/sessions";
import { checkQuotaAndBudget, logSynthesisAndUpdateBudget, checkBudgetCap, BUDGET_CAP_USD, currentMonthKey } from "../quota";
import { synthesizeWithRouting } from "../providers";
import { checkUnlimitedThresholds } from "../lib/unlimited-thresholds";
import type { Env } from "../lib/env";


const SynthesizeSchema = z.object({
  transcript: z.string().min(10).max(100_000),
  // template_id NON è z.uuid(): gli id di sistema sono stringhe tipo
  // 'sys_generic_it_v2', solo i custom sono UUID.
  template_id: z.string().optional(),
  language: z.enum(["it", "en", "fr", "es", "de"]).default("it"),
  meeting_id: z.string().uuid(),
  // NOTA: system_prompt NON è più accettato dal client. Il prompt viene
  // ricostruito server-side dal template_id (vedi resolveSystemPrompt).
  audio_minutes: z.number().min(0).default(0),
  notes: z.string().max(10_000).optional(),
  mode: z.enum(['standard', 'local']).default('standard'),
});

// Prompt generico hard-coded: ultima rete di sicurezza se anche il template
// di sistema non si carica dal DB. Non deve mai restare vuoto.
const FALLBACK_SYSTEM_PROMPT =
  "Sei un assistente che sintetizza meeting professionali. Ricevi la trascrizione di una conversazione e produci una sintesi strutturata, asciutta e professionale in Markdown, usando solo informazioni esplicitamente presenti nella trascrizione. Non inventare nulla.";

// Replica della logica del client (RecordingPage.tsx): id del template generico
// di sistema per lingua. 'it' usa v2, le altre lingue v1. Volutamente NON
// centralizzato per evitare scope creep.
function genericTemplateId(language: string): string {
  const v = language === 'it' ? '2' : '1';
  return `sys_generic_${language}_v${v}`;
}

// Carica il base prompt server-side dal template_id, con ownership check e
// fallback sicuro. Non lancia mai: in ogni caso di errore ritorna un prompt
// utilizzabile, eventualmente loggando un segnale anti-abuso.
async function resolveSystemPrompt(
  env: Env,
  userId: string,
  templateId: string | undefined,
  language: string,
): Promise<string> {
  if (templateId) {
    const tmpl = await env.DB.prepare(
      `SELECT system_prompt, user_id, is_system FROM templates WHERE id = ?`
    )
      .bind(templateId)
      .first<{ system_prompt: string; user_id: string | null; is_system: number }>();

    if (tmpl) {
      // Template di sistema: utilizzabile da chiunque.
      if (tmpl.is_system === 1) return tmpl.system_prompt;
      // Template custom: deve appartenere all'utente che lo richiede.
      if (tmpl.user_id === userId) return tmpl.system_prompt;
      // Custom di un ALTRO utente: tentativo di accesso a dati altrui.
      // Stessa UX del fallback (silenziosa, nessun 403) ma loggato come
      // evento DISTINTO per visibilità anti-abuso.
      console.warn(JSON.stringify({
        event: 'template_cross_user_access',
        userId,
        templateId,
        ownerId: tmpl.user_id,
      }));
    } else {
      // template_id presente ma inesistente.
      console.warn(JSON.stringify({
        event: 'template_not_found',
        userId,
        templateId,
      }));
    }
  } else {
    // template_id mancante del tutto.
    console.warn(JSON.stringify({
      event: 'template_id_missing',
      userId,
    }));
  }

  // Fallback: prompt generico di sistema nella lingua richiesta.
  const generic = await env.DB.prepare(
    `SELECT system_prompt FROM templates WHERE id = ? AND is_system = 1`
  )
    .bind(genericTemplateId(language))
    .first<{ system_prompt: string }>();

  return generic?.system_prompt ?? FALLBACK_SYSTEM_PROMPT;
}

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

  // Prompt ricostruito server-side dal template_id (mai dal client), con
  // ownership check e fallback sicuro. buildSystemPrompt vi aggiunge sopra
  // le preferenze utente (anch'esse server-side).
  const baseSystemPrompt = await resolveSystemPrompt(
    env,
    session.userId,
    body.template_id,
    body.language,
  )
  const finalSystemPrompt = buildSystemPrompt(baseSystemPrompt, userPrefs)

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

  // 5. Quota + budget check (solo cloud)
  if (body.mode !== 'local') {
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
  }

  // 6. Flag check (soft enforcement)
  const signupRow = await env.DB
    .prepare('SELECT flagged FROM signup_signals WHERE user_id = ?')
    .bind(session.userId)
    .first<{ flagged: number }>()
  const isFlagged = signupRow?.flagged === 1

  // Local Only è gestito interamente client-side (Ollama): questa route
  // non dovrebbe mai ricevere mode:local. Se arriva qui è un bug del client.
  if (body.mode === 'local') {
    return new Response(
      JSON.stringify({ error: 'invalid_mode', message: 'mode:local è gestito client-side e non deve essere inviato a questa route.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
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
          .bind(crypto.randomUUID(), session.userId, currentMonthKey(), body.audio_minutes, Date.now())
          .run();
      } catch (quotaErr) {
        console.error('[synthesize] quota update failed:', quotaErr);
      }

      // Fire-and-forget: check unlimited thresholds after quota is updated
      ;(async () => {
        try {
          const updatedQuota = await env.DB
            .prepare('SELECT synthesis_minutes FROM quota WHERE user_id = ? AND month = ?')
            .bind(session.userId, currentMonthKey())
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