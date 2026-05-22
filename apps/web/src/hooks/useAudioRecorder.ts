/**
 * useAudioRecorder.ts
 * Hook che gestisce l'intero ciclo di vita della registrazione:
 * start → recording → stop → Float32Array pronto per Whisper
 */

import { useState, useRef, useCallback } from 'react'
import type { AudioSource } from '../lib/audio'
import { createChunkSession, type ChunkStoreSession } from '../lib/chunkStore'
import {
  getMicrophoneStream,
  getTabStream,
  getMixedStream,
  blobToFloat32Array,
  stopStream,
} from '../lib/audio'

export type RecorderState = 'idle' | 'recording' | 'processing' | 'done' | 'error'

export interface UseAudioRecorderReturn {
  state: RecorderState
  duration: number
  error: string | null
  paused: boolean
  start: (source: AudioSource) => Promise<void>
  stop: () => void
  pause: () => void
  resume: () => void
  audioData: Float32Array | null
  reset: () => void
  stream: MediaStream | null
  sessionId: string | null
  chunkCount: number
  chunkSession: ChunkStoreSession | null
}

export function useAudioRecorder(): UseAudioRecorderReturn {
  const [state, setState] = useState<RecorderState>('idle')
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [paused, setPaused] = useState(false)
  const [audioData, setAudioData] = useState<Float32Array | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [chunkCount, setChunkCount] = useState(0)
  const [chunkSession, setChunkSession] = useState<ChunkStoreSession | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamsRef = useRef<MediaStream[]>([])
  const audioContextRef = useRef<AudioContext | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(0)
  const chunkSessionRef = useRef<ChunkStoreSession | null>(null)
  const chunkStartMsRef = useRef(0)
  const chunkIndexRef = useRef(0)

  const cleanup = useCallback(() => {
    timerRef.current && clearInterval(timerRef.current)
    streamsRef.current.forEach(stopStream)
    streamsRef.current = []
    audioContextRef.current?.close()
    audioContextRef.current = null
    mediaRecorderRef.current = null
    chunksRef.current = []
    chunkSessionRef.current = null
    chunkIndexRef.current = 0
    setChunkCount(0)
    setSessionId(null)
    setChunkSession(null)
    setStream(null)
  }, [])

  const start = useCallback(async (source: AudioSource) => {
    try {
      setState('recording')
      setError(null)
      setAudioData(null)
      setDuration(0)
      chunksRef.current = []

      let micStream: MediaStream | null = null
      let tabStream: MediaStream | null = null
      let recordStream: MediaStream

      if (source === 'microphone' || source === 'both') {
        micStream = await getMicrophoneStream()
        streamsRef.current.push(micStream)
      }

      if (source === 'tab' || source === 'both') {
        tabStream = await getTabStream()
        streamsRef.current.push(tabStream)
      }

      if (source === 'both' && micStream && tabStream) {
        const { stream, context } = await getMixedStream(micStream, tabStream)
        recordStream = stream
        audioContextRef.current = context
      } else {
        recordStream = (micStream ?? tabStream)!
      }

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
        ? 'audio/ogg;codecs=opus'
        : ''

      const chunkSession = await createChunkSession(mimeType || 'audio/webm')
      chunkSessionRef.current = chunkSession
      chunkIndexRef.current = 0
      chunkStartMsRef.current = Date.now()
      setSessionId(chunkSession.sessionId)
      setChunkSession(chunkSession)
      setChunkCount(0)

      setStream(recordStream)
      const recorder = new MediaRecorder(recordStream, mimeType ? { mimeType } : undefined)
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = async (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
          const session = chunkSessionRef.current
          if (session) {
            const idx = chunkIndexRef.current++
            const startMs = idx * 30000
            await session.encryptChunk(e.data, idx, startMs)
            setChunkCount(idx + 1)
          }
        }
      }

      recorder.onstop = async () => {
        setPaused(false)
        setState('processing')
        const chunks = [...chunksRef.current]
        const finalSession = chunkSessionRef.current
        cleanup()
        try {
          const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
          const float32 = await blobToFloat32Array(blob)
          setAudioData(float32)
          setState('done')
          if (finalSession) await finalSession.deleteAll()
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Errore conversione audio')
          setState('error')
        }
      }

      recorder.start(30000)

      // Timer durata — usa Date.now() per durata reale anche con tab throttling
      startTimeRef.current = Date.now()
      timerRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000))
      }, 500)

    } catch (err) {
      cleanup()
      setError(err instanceof Error ? err.message : 'Errore avvio registrazione')
      setState('error')
    }
  }, [cleanup])

  const stop = useCallback(() => {
    timerRef.current && clearInterval(timerRef.current)
    mediaRecorderRef.current?.stop()
  }, [])

  const pause = useCallback(() => {
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state === 'recording') {
      recorder.pause()
      timerRef.current && clearInterval(timerRef.current)
      setPaused(true)
    }
  }, [])

  const resume = useCallback(() => {
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state === 'paused') {
      recorder.resume()
      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000)
      setPaused(false)
    }
  }, [])

  const reset = useCallback(() => {
    cleanup()
    setState('idle')
    setDuration(0)
    setError(null)
    setAudioData(null)
    setPaused(false)
  }, [cleanup])

  return { state, duration, error, paused, start, stop, pause, resume, audioData, reset, stream, sessionId, chunkCount, chunkSession }
}