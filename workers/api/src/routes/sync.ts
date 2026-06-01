import { z } from "zod";
import { getUserFromSession } from "../lib/sessions";
import type { Env } from "../lib/env";

const MAX_BLOB_SIZE = 25 * 1024 * 1024; // 25 MB
const SBB1_MAGIC = [83, 66, 66, 49] as const;

const MeetingIdSchema = z.object({
  meeting_id: z.string().uuid(),
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function handleSyncUpload(request: Request, env: Env): Promise<Response> {
  const session = await getUserFromSession(request, env);
  if (!session) return new Response("Unauthorized", { status: 401 });

  const formData = await request.formData().catch(() => null);
  if (!formData) return json({ error: "invalid_form_data" }, 400);

  const meetingIdRaw = formData.get("meeting_id");
  const blobField = formData.get("blob");

  if (typeof meetingIdRaw !== "string" || !(blobField instanceof File)) {
    return json({ error: "invalid_input" }, 400);
  }

  let fields: { meeting_id: string };
  try {
    fields = MeetingIdSchema.parse({ meeting_id: meetingIdRaw });
  } catch {
    return json({ error: "invalid_meeting_id" }, 400);
  }

  const { meeting_id } = fields;

  if (blobField.size < 1 || blobField.size > MAX_BLOB_SIZE) {
    return json({ error: "invalid_blob_size" }, 400);
  }

  const blobBuffer = await blobField.arrayBuffer();
  const magic = new Uint8Array(blobBuffer, 0, 4);
  if (
    magic[0] !== SBB1_MAGIC[0] ||
    magic[1] !== SBB1_MAGIC[1] ||
    magic[2] !== SBB1_MAGIC[2] ||
    magic[3] !== SBB1_MAGIC[3]
  ) {
    return json({ error: "invalid_magic" }, 400);
  }

  const path = `${session.userId}/${meeting_id}.sbb`;

  await env.BLOBS.put(path, blobBuffer, {
    httpMetadata: { contentType: "application/octet-stream" },
  });

  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO sync_blobs (user_id, meeting_id, blob_size, uploaded_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (user_id, meeting_id) DO UPDATE SET blob_size = excluded.blob_size, updated_at = excluded.updated_at`
  )
    .bind(session.userId, meeting_id, blobField.size, now, now)
    .run();

  return json({ ok: true, path, size: blobField.size });
}

const MAX_KEYRING_SIZE = 8 * 1024; // 8 KB — il keyring è piccolo (2 wrapped key + salt)

/**
 * GET /v1/sync/keyring — restituisce il keyring cifrato dell'utente.
 * Il server conserva solo il blob: non può decifrare nulla (zero-knowledge).
 */
export async function handleKeyringGet(request: Request, env: Env): Promise<Response> {
  const session = await getUserFromSession(request, env);
  if (!session) return new Response("Unauthorized", { status: 401 });

  const row = await env.DB
    .prepare("SELECT keyring_json, updated_at FROM sync_keyring WHERE user_id = ?")
    .bind(session.userId)
    .first<{ keyring_json: string; updated_at: number }>();

  if (!row) return json({ keyring: null }, 200);

  return json({ keyring: JSON.parse(row.keyring_json), updated_at: row.updated_at }, 200);
}

/**
 * PUT /v1/sync/keyring — salva/aggiorna il keyring cifrato dell'utente.
 * Body: { keyring: <oggetto JSON> }. Il server non interpreta il contenuto.
 */
export async function handleKeyringPut(request: Request, env: Env): Promise<Response> {
  const session = await getUserFromSession(request, env);
  if (!session) return new Response("Unauthorized", { status: 401 });

  const body = await request.json().catch(() => null) as { keyring?: unknown } | null;
  if (!body || typeof body.keyring !== "object" || body.keyring === null) {
    return json({ error: "invalid_keyring" }, 400);
  }

  const keyringJson = JSON.stringify(body.keyring);
  if (keyringJson.length > MAX_KEYRING_SIZE) {
    return json({ error: "keyring_too_large" }, 400);
  }

  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO sync_keyring (user_id, keyring_json, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET keyring_json = excluded.keyring_json, updated_at = excluded.updated_at`
  )
    .bind(session.userId, keyringJson, now)
    .run();

  return json({ ok: true }, 200);
}

export async function handleSyncDownload(request: Request, env: Env): Promise<Response> {
  const session = await getUserFromSession(request, env);
  if (!session) return new Response("Unauthorized", { status: 401 });

  let fields: { meeting_id: string };
  try {
    fields = MeetingIdSchema.parse(await request.json());
  } catch {
    return json({ error: "invalid_input" }, 400);
  }

  const path = `${session.userId}/${fields.meeting_id}.sbb`;
  const object = await env.BLOBS.get(path);

  if (!object) return json({ error: "blob_not_found" }, 404);

  return new Response(object.body, {
    headers: { "Content-Type": "application/octet-stream" },
  });
}
