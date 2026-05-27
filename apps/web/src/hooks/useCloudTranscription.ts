import { useCallback, useRef, useState } from 'react'
import {
  transcribeCloud,
  CloudVeloceNotAvailableError,
  CloudVeloceQuotaError,
  CloudVeloceRateLimitedError,
} from '../lib/transcribeCloud'
import type { WhisperSegment } from '../components/TranscriptViewer'

export type CloudTranscriptionStatus = 'idle' | 'transcribing' | 'done' | 'error'

export type CloudTranscriptionErrorKind = 'quota' | 'not_available' | 'rate_limited' | 'generic'

export interface CloudTranscriptionError {
  kind: CloudTranscriptionErrorKind
  message: string
}

export type CloudSegment = WhisperSegment & { speaker?: string }

export interface UseCloudTranscriptionReturn {
  status: CloudTranscriptionStatus
  transcript: string
  segments: CloudSegment[]
  error: CloudTranscriptionError | null
  minutesRemaining: number | null
  transcribe: (blob: Blob, language?: string) => Promise<void>
  retry: () => Promise<void>
  reset: () => void
}

function normalizeSegments(raw: unknown[]): CloudSegment[] {
  return raw.map(s => {
    const seg = s as { start?: number; end?: number; text?: string; speaker?: string }
    const result: CloudSegment = {
      timestamp: [seg.start ?? 0, seg.end ?? null],
      text: seg.text ?? '',
    }
    if (seg.speaker) result.speaker = seg.speaker
    return result
  })
}

export function useCloudTranscription(): UseCloudTranscriptionReturn {
  const [status, setStatus] = useState<CloudTranscriptionStatus>('idle')
  const [transcript, setTranscript] = useState('')
  const [segments, setSegments] = useState<CloudSegment[]>([])
  const [error, setError] = useState<CloudTranscriptionError | null>(null)
  const [minutesRemaining, setMinutesRemaining] = useState<number | null>(null)
  const lastArgsRef = useRef<{ blob: Blob; language?: string } | null>(null)

  const transcribe = useCallback(async (blob: Blob, language?: string) => {
    lastArgsRef.current = { blob, language }
    setStatus('transcribing')
    setError(null)
    setTranscript('')
    setSegments([])
    try {
      const result = await transcribeCloud(blob, language)
      setTranscript(result.transcript)
      setSegments(normalizeSegments(result.segments))
      setMinutesRemaining(result.minutesRemaining)
      setStatus('done')
    } catch (err) {
      if (err instanceof CloudVeloceQuotaError) {
        setError({ kind: 'quota', message: err.message })
      } else if (err instanceof CloudVeloceNotAvailableError) {
        setError({ kind: 'not_available', message: err.message })
      } else if (err instanceof CloudVeloceRateLimitedError) {
        setError({ kind: 'rate_limited', message: err.message })
      } else {
        setError({ kind: 'generic', message: err instanceof Error ? err.message : 'Errore' })
      }
      setStatus('error')
    }
  }, [])

  const retry = useCallback(async () => {
    const last = lastArgsRef.current
    if (!last) return
    await transcribe(last.blob, last.language)
  }, [transcribe])

  const reset = useCallback(() => {
    setStatus('idle')
    setTranscript('')
    setSegments([])
    setError(null)
    setMinutesRemaining(null)
    lastArgsRef.current = null
  }, [])

  return { status, transcript, segments, error, minutesRemaining, transcribe, retry, reset }
}
