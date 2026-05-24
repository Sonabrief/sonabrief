import type { DiarizationResult, SpeakerSegment } from '../workers/diarization.worker'

export interface DiarizedSegment {
  start: number
  end: number
  speaker: number
}

type DiarizationEvent =
  | { type: 'loading' }
  | { type: 'ready'; sampleRate: number }
  | { type: 'progress'; value: number; label: string }
  | { type: 'result'; segments: DiarizedSegment[] }
  | { type: 'error'; message: string }

type DiarizationListener = (event: DiarizationEvent) => void

const STORAGE_KEY = 'sonabrief_diarization_enabled'
const MIN_MEMORY_GB = 8
const MIN_CORES = 4
const SAMPLE_RATE = 16000

const _global = {
  worker: null as Worker | null,
  loading: false,
  ready: false,
  listeners: new Set<DiarizationListener>(),
}

function post(event: DiarizationEvent) {
  _global.listeners.forEach(fn => fn(event))
}

export function isDiarizationSupported(): boolean {
  const mem = (navigator as any).deviceMemory ?? 0
  const cores = navigator.hardwareConcurrency ?? 0
  return mem >= MIN_MEMORY_GB && cores >= MIN_CORES
}

export function isDiarizationEnabled(): boolean {
  return localStorage.getItem(STORAGE_KEY) === 'true'
}

export function setDiarizationEnabled(val: boolean) {
  localStorage.setItem(STORAGE_KEY, val ? 'true' : 'false')
}

function getWorker(): Worker {
  if (_global.worker) return _global.worker
  const w = new Worker(
    new URL('../workers/diarization.worker.ts', import.meta.url),
    { type: 'module' }
  )
  w.onmessage = (e: MessageEvent<DiarizationResult>) => {
    const msg = e.data
    if (msg.type === 'ready') {
      _global.ready = true
      _global.loading = false
      post({ type: 'ready', sampleRate: SAMPLE_RATE })
    } else if (msg.type === 'progress') {
      post({ type: 'progress', value: msg.value, label: msg.label })
    } else if (msg.type === 'result') {
      const segments: DiarizedSegment[] = msg.segments.map((s: SpeakerSegment) => ({
        start: s.start,
        end: s.end,
        speaker: parseInt(s.speaker.replace('Speaker ', '')) - 1,
      }))
      post({ type: 'result', segments })
    } else if (msg.type === 'error') {
      _global.loading = false
      post({ type: 'error', message: msg.message })
    }
  }
  w.onerror = (e) => {
    _global.loading = false
    post({ type: 'error', message: e.message })
  }
  _global.worker = w
  return w
}

async function loadModels() {
  if (_global.ready || _global.loading) return
  _global.loading = true
  post({ type: 'loading' })
  getWorker().postMessage({ type: 'init' })
}

async function diarize(
  audio: Float32Array,
  numSpeakers: number | 'auto' = 'auto'
): Promise<DiarizedSegment[] | null> {
  if (!_global.ready) return null
  return new Promise((resolve) => {
    const w = getWorker()
    const handler = (e: MessageEvent<DiarizationResult>) => {
      if (e.data.type === 'result') {
        w.removeEventListener('message', handler)
        const segments: DiarizedSegment[] = e.data.segments.map((s: SpeakerSegment) => ({
          start: s.start,
          end: s.end,
          speaker: parseInt(s.speaker.replace('Speaker ', '')) - 1,
        }))
        resolve(segments)
      } else if (e.data.type === 'error') {
        w.removeEventListener('message', handler)
        resolve(null)
      }
    }
    w.addEventListener('message', handler)
    // Transfer buffer for zero-copy
    const copy = audio.slice()
    w.postMessage({ type: 'process', audio: copy, sampleRate: SAMPLE_RATE, numSpeakers }, [copy.buffer])
  })
}

function on(listener: DiarizationListener) {
  _global.listeners.add(listener)
  return () => _global.listeners.delete(listener)
}

export const diarization = {
  load: loadModels,
  diarize,
  on,
  get isReady() { return _global.ready },
  get sampleRate() { return SAMPLE_RATE },
}

export function mergeDiarizationWithTranscript(
  whisperChunks: { timestamp: [number, number | null]; text: string }[],
  diarSegments: DiarizedSegment[]
): { timestamp: [number, number | null]; text: string; speaker?: number }[] {
  if (!diarSegments.length) return whisperChunks
  return whisperChunks.map(chunk => {
    const chunkStart = chunk.timestamp[0]
    const chunkEnd = chunk.timestamp[1] ?? chunkStart
    let bestSpeaker: number | undefined
    let bestOverlap = 0
    for (const seg of diarSegments) {
      const overlap = Math.max(0, Math.min(chunkEnd, seg.end) - Math.max(chunkStart, seg.start))
      if (overlap > bestOverlap) { bestOverlap = overlap; bestSpeaker = seg.speaker }
    }
    return { ...chunk, speaker: bestSpeaker }
  })
}

export function resampleTo16k(audio: Float32Array, fromSampleRate: number): Float32Array {
  if (fromSampleRate === 16000) return audio
  const ratio = fromSampleRate / 16000
  const newLength = Math.round(audio.length / ratio)
  const result = new Float32Array(newLength)
  for (let i = 0; i < newLength; i++) {
    result[i] = audio[Math.round(i * ratio)] ?? 0
  }
  return result
}