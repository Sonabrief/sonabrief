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
