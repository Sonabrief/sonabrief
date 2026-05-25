import { useEffect, useRef, useCallback } from 'react'
import { whisper } from '../lib/whisper'
import { blobToFloat32ArrayChunk } from '../lib/audio'
import type { ChunkStoreSession } from '../lib/chunkStore'
import { db } from '../lib/db'

const BATCH_SIZE = 4        // 4 chunk × 30s = 2 min
const OVERLAP_CHUNKS = 1    // 1 chunk overlap = 30s (approssimazione overlap 5s non fattibile a livello blob)

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
  const lastOverlapTextRef = useRef('')

  const processBatch = useCallback(async () => {
    if (!session || processingRef.current) return
    const chunks = await session.getTranscribableChunks()
    if (chunks.length < BATCH_SIZE) return

    processingRef.current = true
    const batch = chunks.slice(0, BATCH_SIZE)
    const overlapChunk = chunks[BATCH_SIZE - OVERLAP_CHUNKS] ?? null

    try {
      const texts: string[] = []
      const header = session.getWebMHeader()

      for (const chunk of batch) {
        const blob = await session.decryptChunk(chunk)
        let audio: Float32Array
        try {
          audio = await blobToFloat32ArrayChunk(blob, header, chunk.chunkIndex === 0)
        } catch (err) {
          console.warn(`[chunked] chunk ${chunk.chunkIndex} failed:`, err, 'header bytes:', header?.length ?? 'null')
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
      const text = texts.join(' ')

      // Rimuovi overlap dal testo precedente per evitare duplicati
      const cleanText = lastOverlapTextRef.current
        ? text.replace(lastOverlapTextRef.current.slice(-60), '').trim()
        : text

      accumulatedRef.current += ' ' + cleanText
      const accumulated = accumulatedRef.current.trim()
      onPartialTranscript(accumulated)
      if (sessionId) {
        db.recording_sessions.put({
          sessionId,
          partialText: accumulated,
          lang: language,
          startedAt: session ? Date.now() : 0,
          updatedAt: Date.now(),
          status: 'active',
        }).catch(() => {})
      }

      if (overlapChunk) {
        const overlapBlob = await session.decryptChunk(overlapChunk)
        let overlapAudio: Float32Array
        try {
          overlapAudio = await blobToFloat32ArrayChunk(
            overlapBlob,
            header,
            overlapChunk.chunkIndex === 0,
          )
        } catch (err) {
          console.warn('[chunked] overlap chunk failed:', err)
          return
        }
        const overlapId = overlapChunk.id + '_overlap'
        const overlapPromise = new Promise<string>((resolve) => {
          const unsub = whisper.on((event) => {
            if (event.type === 'chunk_result' && event.batchId === overlapId) {
              unsub()
              resolve(event.text)
            }
          })
        })
        whisper.transcribeChunk(overlapAudio, language, overlapId)
        lastOverlapTextRef.current = await overlapPromise
      }

      // Cancella i chunk trascritti (non l'overlap, non il chunk 0 che serve come header)
      const toDelete = batch
        .slice(0, BATCH_SIZE - OVERLAP_CHUNKS)
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
    lastOverlapTextRef.current = ''

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
    lastOverlapTextRef.current = ''
  }, [])

  return { reset, getAccumulated: () => accumulatedRef.current }
}
