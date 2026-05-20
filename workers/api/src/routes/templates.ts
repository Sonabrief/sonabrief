import { z } from "zod";
import { getUserFromSession } from "../lib/sessions";
import type { Env } from "../lib/env";

const CUSTOM_TEMPLATE_LIMITS: Record<string, number> = {
  free: 0,
  pro: 5,
  unlimited: Infinity,
};

const TemplateWriteSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  language: z.enum(["it", "en", "fr", "es", "de"]),
  system_prompt: z.string().min(10).max(10_000),
  output_structure: z.string().max(10_000).optional(),
  parent_id: z.string().uuid().optional(),
});

async function getUserTier(env: Env, userId: string): Promise<string> {
  const row = await env.DB.prepare(
    `SELECT tier FROM licenses WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1`
  )
    .bind(userId)
    .first<{ tier: string }>();
  return row?.tier ?? "free";
}

export async function handleTemplates(req: Request, env: Env): Promise<Response> {
  const session = await getUserFromSession(req, env);
  if (!session) return new Response("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const method = req.method;

  // GET /v1/templates
  if (method === "GET") {
    const tier = await getUserTier(env, session.userId);

    const FREE_SYSTEM_TEMPLATES = [
      'sys_generic_it_v2',
      'sys_client_meeting_it_v1',
      'sys_one_on_one_it_v1',
    ];

    let rows;
    if (tier === 'free') {
      const placeholders = FREE_SYSTEM_TEMPLATES.map(() => '?').join(', ');
      rows = await env.DB.prepare(
        `SELECT id, user_id, name, description, language, system_prompt, output_structure, is_system, parent_id, created_at, updated_at
         FROM templates
         WHERE is_system = 1 AND id IN (${placeholders})
         ORDER BY created_at ASC`
      )
        .bind(...FREE_SYSTEM_TEMPLATES)
        .all();
    } else {
      rows = await env.DB.prepare(
        `SELECT id, user_id, name, description, language, system_prompt, output_structure, is_system, parent_id, created_at, updated_at
         FROM templates
         WHERE is_system = 1 OR user_id = ?
         ORDER BY is_system DESC, created_at ASC`
      )
        .bind(session.userId)
        .all();
    }

    return json(rows.results);
  }

  // POST /v1/templates
  if (method === "POST") {
    const tier = await getUserTier(env, session.userId);
    const limit = CUSTOM_TEMPLATE_LIMITS[tier] ?? 0;

    if (limit === 0) {
      return json({ error: "custom_templates_not_allowed", hint: "upgrade_to_pro" }, 403);
    }

    if (limit !== Infinity) {
      const countRow = await env.DB.prepare(
        `SELECT COUNT(*) as count FROM templates WHERE user_id = ? AND is_system = 0`
      )
        .bind(session.userId)
        .first<{ count: number }>();
      if ((countRow?.count ?? 0) >= limit) {
        return json({ error: "template_limit_reached", limit }, 403);
      }
    }

    let body: z.infer<typeof TemplateWriteSchema>;
    try {
      body = TemplateWriteSchema.parse(await req.json());
    } catch {
      return json({ error: "invalid_input" }, 400);
    }

    const id = crypto.randomUUID();
    const now = Date.now();

    await env.DB.prepare(
      `INSERT INTO templates (id, user_id, name, description, language, system_prompt, output_structure, is_system, parent_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`
    )
      .bind(id, session.userId, body.name, body.description ?? null, body.language, body.system_prompt, body.output_structure ?? null, body.parent_id ?? null, now, now)
      .run();

    return json({ id }, 201);
  }

  // PUT /v1/templates/:id
  if (method === "PUT") {
    const id = url.pathname.split("/").at(-1);
    if (!id) return json({ error: "missing_id" }, 400);

    const existing = await env.DB.prepare(
      `SELECT user_id, is_system FROM templates WHERE id = ?`
    )
      .bind(id)
      .first<{ user_id: string; is_system: number }>();

    if (!existing) return json({ error: "not_found" }, 404);
    if (existing.is_system) return json({ error: "cannot_edit_system_template" }, 403);
    if (existing.user_id !== session.userId) return json({ error: "forbidden" }, 403);

    let body: z.infer<typeof TemplateWriteSchema>;
    try {
      body = TemplateWriteSchema.parse(await req.json());
    } catch {
      return json({ error: "invalid_input" }, 400);
    }

    await env.DB.prepare(
      `UPDATE templates SET name=?, description=?, language=?, system_prompt=?, output_structure=?, updated_at=? WHERE id=?`
    )
      .bind(body.name, body.description ?? null, body.language, body.system_prompt, body.output_structure ?? null, Date.now(), id)
      .run();

    return json({ ok: true });
  }

  // DELETE /v1/templates/:id
  if (method === "DELETE") {
    const id = url.pathname.split("/").at(-1);
    if (!id) return json({ error: "missing_id" }, 400);

    const existing = await env.DB.prepare(
      `SELECT user_id, is_system FROM templates WHERE id = ?`
    )
      .bind(id)
      .first<{ user_id: string; is_system: number }>();

    if (!existing) return json({ error: "not_found" }, 404);
    if (existing.is_system) return json({ error: "cannot_delete_system_template" }, 403);
    if (existing.user_id !== session.userId) return json({ error: "forbidden" }, 403);

    await env.DB.prepare(`DELETE FROM templates WHERE id = ?`).bind(id).run();

    return json({ ok: true });
  }

  return json({ error: "method_not_allowed" }, 405);
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}