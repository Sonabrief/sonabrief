import sodium from 'libsodium-wrappers-sumo'
import { db } from './db'
import type { RecordingChunk } from './db'

export interface ChunkStoreSession {
  sessionId: string
  encryptChunk: (blob: Blob, chunkIndex: number, startMs: number) => Promise<string>
  getTranscribableChunks: () => Promise<RecordingChunk[]>
  decryptChunk: (chunk: RecordingChunk) => Promise<Blob>
  markTranscribed: (chunkIds: string[]) => Promise<void>
  deleteTranscribed: () => Promise<void>
  deleteAll: () => Promise<void>
}

export async function createChunkSession(mimeType: string): Promise<ChunkStoreSession> {
  await sodium.ready
  const sessionId = crypto.randomUUID()
  const key = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES)

  async function encryptChunk(blob: Blob, chunkIndex: number, startMs: number): Promise<string> {
    const id = crypto.randomUUID()
    const arrayBuffer = await blob.arrayBuffer()
    const plaintext = new Uint8Array(arrayBuffer)
    const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES)
    const encryptedData = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(plaintext, null, null, nonce, key)
    await db.recording_chunks.add({
      id,
      sessionId,
      chunkIndex,
      encryptedData,
      nonce,
      startMs,
      durationMs: 30000,
      status: 'pending',
      createdAt: Date.now(),
    })
    return id
  }

  async function getTranscribableChunks(): Promise<RecordingChunk[]> {
    return db.recording_chunks
      .where('sessionId').equals(sessionId)
      .and(c => c.status === 'pending')
      .sortBy('chunkIndex')
  }

  async function decryptChunk(chunk: RecordingChunk): Promise<Blob> {
    const plaintext = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null, chunk.encryptedData, null, chunk.nonce, key
    )
    return new Blob([plaintext], { type: mimeType })
  }

  async function markTranscribed(chunkIds: string[]): Promise<void> {
    await db.recording_chunks
      .where('id').anyOf(chunkIds)
      .modify({ status: 'transcribed' })
  }

  async function deleteTranscribed(): Promise<void> {
    await db.recording_chunks
      .where('sessionId').equals(sessionId)
      .and(c => c.status === 'transcribed')
      .delete()
  }

  async function deleteAll(): Promise<void> {
    await db.recording_chunks
      .where('sessionId').equals(sessionId)
      .delete()
  }

  return { sessionId, encryptChunk, getTranscribableChunks, decryptChunk, markTranscribed, deleteTranscribed, deleteAll }
}

// Cerca chunk orfani di sessioni precedenti (crash recovery)
export async function findOrphanChunks(): Promise<{ sessionId: string; count: number; oldestMs: number }[]> {
  const all = await db.recording_chunks
    .where('status').equals('pending')
    .toArray()
  if (!all.length) return []
  const bySession = new Map<string, RecordingChunk[]>()
  for (const chunk of all) {
    const arr = bySession.get(chunk.sessionId) ?? []
    arr.push(chunk)
    bySession.set(chunk.sessionId, arr)
  }
  return [...bySession.entries()].map(([sessionId, chunks]) => ({
    sessionId,
    count: chunks.length,
    oldestMs: Math.min(...chunks.map(c => c.createdAt)),
  }))
}

// Recovery: decripta e restituisce tutti i chunk orfani di una sessione
// Nota: la chiave non è disponibile dopo crash — questo path restituisce i blob grezzi cifrati
// per UI informativa. La trascrizione reale post-crash non è possibile (chiave in-memory persa).
// La UI deve comunicare questo all'utente onestamente.
export async function deleteOrphanSession(sessionId: string): Promise<void> {
  await db.recording_chunks.where('sessionId').equals(sessionId).delete()
}
