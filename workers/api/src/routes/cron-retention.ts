import type { Env } from "../lib/env";

const RETENTION_DAYS: Record<string, number> = {
  free: 7,
  pro: 365,
};

export async function handleRetentionCleanup(env: Env): Promise<void> {
  const now = Date.now();

  // Pulisci challenge WebAuthn scaduti (5 min TTL — accumulano rapidamente)
  await env.DB.prepare(`DELETE FROM webauthn_challenges WHERE expires_at < ?`)
    .bind(now)
    .run();

  for (const [tier, days] of Object.entries(RETENTION_DAYS)) {
    const cutoff = now - days * 24 * 60 * 60 * 1000;

    const rows = await env.DB.prepare(`
      SELECT sb.user_id, sb.meeting_id, sb.blob_size
      FROM sync_blobs sb
      JOIN licenses l ON sb.user_id = l.user_id
      WHERE l.tier = ?
        AND sb.uploaded_at < ?
    `).bind(tier, cutoff).all();

    if (!rows.results.length) continue;

    let bytesFreed = 0;

    for (const row of rows.results as { user_id: string; meeting_id: string; blob_size: number }[]) {
      const path = `${row.user_id}/${row.meeting_id}.sbb`;
      try {
        await env.BLOBS.delete(path);
        bytesFreed += row.blob_size ?? 0;
      } catch {
        // continua sugli altri
      }
    }

    await env.DB.prepare(`
      DELETE FROM sync_blobs
      WHERE user_id IN (
        SELECT sb.user_id FROM sync_blobs sb
        JOIN licenses l ON sb.user_id = l.user_id
        WHERE l.tier = ? AND sb.uploaded_at < ?
      )
      AND uploaded_at < ?
    `).bind(tier, cutoff, cutoff).run();

    await env.DB.prepare(`
      INSERT INTO retention_log (ran_at, tier, records_deleted, bytes_freed)
      VALUES (?, ?, ?, ?)
    `).bind(now, tier, rows.results.length, bytesFreed).run();
  }
}