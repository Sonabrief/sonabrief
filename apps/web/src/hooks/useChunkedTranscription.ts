import { useEffect, useRef, useCallback } from 'react'
import { whisper } from '../lib/whisper'
import { blobToFloat32ArrayChunk } from '../lib/audio'
import type { ChunkStoreSession } from '../lib/chunkStore'
import { db } from '../lib/db'

const BATCH_SIZE = 4        // 4 chunk × 30s = 2 min

interface UseChunkedTranscriptionOptions {
  session: ChunkStoreSession | null
  sessionId: string | null
  language: string
  isRecording: boolean
  onPartialTranscript: (text: string) => void
}

export function useChunkedTranscription({
  session,
  sessionId,
  language,
  isRecording,
  onPartialTranscript,
}: UseChunkedTranscriptionOptions) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const processingRef = useRef(false)
  const accumulatedRef = useRef('')
  const isActiveRef = useRef(false)
  const isRecordingRef = useRef(false)
  const lastTranscribedIndexRef = useRef(-1)

  const processBatch = useCallback(async () => {
    if (!session || processingRef.current) return
    const chunks = await session.getTranscribableChunks()
    if (chunks.length < BATCH_SIZE) return

    processingRef.current = true
    // Prendi solo chunk NON ancora trascritti
    const newChunks = chunks.filter(c => c.chunkIndex > lastTranscribedIndexRef.current)
    if (newChunks.length < BATCH_SIZE) {
      processingRef.current = false
      return
    }
    const batch = newChunks.slice(0, BATCH_SIZE)

    try {
      const texts: string[] = []
      const header = session.getWebMHeader()

      for (const chunk of batch) {
        const blob = await session.decryptChunk(chunk)
        let audio: Float32Array
        try {
          audio = await blobToFloat32ArrayChunk(blob, header, chunk.chunkIndex === 0)
        } catch (err) {
          console.warn(`[chunked] chunk ${chunk.chunkIndex} failed:`, err)
          continue
        }
        const chunkBatchId = chunk.id
        const chunkText = await new Promise<string>((resolve) => {
          const unsub = whisper.on((event) => {
            if (event.type === 'chunk_result' && event.batchId === chunkBatchId) {
              unsub()
              resolve(event.text)
            }
          })
          whisper.transcribeChunk(audio, language, chunkBatchId)
        })
        texts.push(chunkText.trim())
      }

      // Aggiorna indice ultimo chunk trascritto
      const lastChunk = batch[batch.length - 1]
      lastTranscribedIndexRef.current = lastChunk.chunkIndex

      const newText = texts.filter(Boolean).join(' ')
      accumulatedRef.current = (accumulatedRef.current + ' ' + newText).trim()

      const accumulated = accumulatedRef.current
      onPartialTranscript(accumulated)

      if (sessionId) {
        db.recording_sessions.put({
          sessionId,
          partialText: accumulated,
          lang: language,
          startedAt: session ? Date.now() : 0,
          updatedAt: Date.now(),
          status: 'active',
        }).catch((e) => console.warn('[chunked-transcription] persist failed', e))
      }

      // Cancella chunk trascritti (escludi chunk 0 header)
      const toDelete = batch
        .filter(c => c.chunkIndex !== 0)
        .map(c => c.id)
      await session.markTranscribed(toDelete)
      await session.deleteTranscribed()

    } finally {
      processingRef.current = false
    }
  }, [session, sessionId, language, onPartialTranscript])

  useEffect(() => {
    isRecordingRef.current = isRecording
  }, [isRecording])

  useEffect(() => {
    if (!isRecording || !session) return
    accumulatedRef.current = ''
    lastTranscribedIndexRef.current = -1

    if (sessionId) {
      db.recording_sessions.put({
        sessionId,
        partialText: '',
        lang: language,
        startedAt: Date.now(),
        updatedAt: Date.now(),
        status: 'active',
      }).catch(() => {})
    }
    isActiveRef.current = true

    // Prima esecuzione immediata (dopo 30s ci sono già chunk)
    // poi ogni 2 min
    const timeoutRef = setTimeout(() => {
      processBatch()
      intervalRef.current = setInterval(processBatch, 120_000)
    }, 35_000) // 35s: tempo minimo per avere almeno 1 chunk

    return () => {
      isActiveRef.current = false
      clearTimeout(timeoutRef)
      intervalRef.current && clearInterval(intervalRef.current)
      if (sessionId && isRecordingRef.current) {
        db.recording_sessions.update(sessionId, {
          status: 'interrupted',
          updatedAt: Date.now(),
        }).catch(() => {})
      }
    }
  }, [isRecording, session, processBatch])

  const reset = useCallback(() => {
    intervalRef.current && clearInterval(intervalRef.current)
    processingRef.current = false
    accumulatedRef.current = ''
    lastTranscribedIndexRef.current = -1
  }, [])

  return { reset, getAccumulated: () => accumulatedRef.current }
}
