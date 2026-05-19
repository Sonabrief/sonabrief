import { db } from './db'
import { embeddingsService } from './embeddings'

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-10)
}

export async function semanticSearch(
  query: string,
  topK = 5
): Promise<{ meetingId: string; title: string; date: number; score: number; preview: string }[]> {
  return new Promise((resolve) => {
    const unsub = embeddingsService.on(async (event) => {
      if (event.type !== 'result' || event.id !== '__query__') return
      unsub()

      const queryVector = event.vector
      const allEmbeddings = await db.embeddings.toArray()
      if (allEmbeddings.length === 0) { resolve([]); return }

      const scored = allEmbeddings.map(e => ({
        meetingId: e.meetingId,
        score: cosineSimilarity(queryVector, e.vector),
      }))
      scored.sort((a, b) => b.score - a.score)

      const top = scored.slice(0, topK).filter(s => s.score > 0.3)
      const results = await Promise.all(
        top.map(async ({ meetingId, score }) => {
          const meeting = await db.meetings.get(meetingId)
          const note = await db.notes.where('meetingId').equals(meetingId).first()
          const preview = (note?.content ?? '')
            .split('\n')
            .map(l => l.replace(/^#+\s*/, '').replace(/\*\*/g, '').trim())
            .filter(l => l.length > 10)
            .slice(0, 2)
            .join(' · ')
          return {
            meetingId,
            title: meeting?.title ?? 'Meeting',
            date: meeting?.startedAt ?? 0,
            score,
            preview,
          }
        })
      )
      resolve(results.filter(r => r.date > 0))
    })

    embeddingsService.embed('__query__', query)
  })
}

export async function saveEmbeddingForMeeting(meetingId: string, text: string) {
  return new Promise<void>((resolve) => {
    const unsub = embeddingsService.on(async (event) => {
      if (event.type !== 'result' || event.id !== meetingId) return
      unsub()
      const now = Date.now()
      await db.embeddings.put({ meetingId, vector: event.vector, createdAt: now })
      resolve()
    })
    embeddingsService.embed(meetingId, text)
  })
}
