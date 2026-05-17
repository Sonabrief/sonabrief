/**
 * useAudioRecorder.ts
 * Hook che gestisce l'intero ciclo di vita della registrazione:
 * start → recording → stop → Float32Array pronto per Whisper
 */

import { useState, useRef, useCallback } from 'react'
import type { AudioSource } from '../lib/audio'
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
  start: (source: AudioSource) => Promise<void>
  stop: () => void
  audioData: Float32Array | null
  reset: () => void
  stream: MediaStream | null
}

export function useAudioRecorder(): UseAudioRecorderReturn {
  const [state, setState] = useState<RecorderState>('idle')
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [audioData, setAudioData] = useState<Float32Array | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamsRef = useRef<MediaStream[]>([])
  const audioContextRef = useRef<AudioContext | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const cleanup = useCallback(() => {
    timerRef.current && clearInterval(timerRef.current)
    streamsRef.current.forEach(stopStream)
    streamsRef.current = []
    audioContextRef.current?.close()
    audioContextRef.current = null
    mediaRecorderRef.current = null
    chunksRef.current = []
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

      setStream(recordStream)
      const recorder = new MediaRecorder(recordStream, mimeType ? { mimeType } : undefined)
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        setState('processing')
        const chunks = [...chunksRef.current]
        cleanup()
        try {
          const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
          const float32 = await blobToFloat32Array(blob)
          setAudioData(float32)
          setState('done')
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Errore conversione audio')
          setState('error')
        }
      }

      recorder.start(1000)

      timerRef.current = setInterval(() => {
        setDuration(d => d + 1)
      }, 1000)

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

  const reset = useCallback(() => {
    cleanup()
    setState('idle')
    setDuration(0)
    setError(null)
    setAudioData(null)
  }, [cleanup])

  return { state, duration, error, start, stop, audioData, reset, stream }
}