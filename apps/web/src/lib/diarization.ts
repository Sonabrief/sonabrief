export interface DiarizedSegment {
  start: number
  end: number
  speaker: number
}

type DiarizationEvent =
  | { type: 'loading' }
  | { type: 'ready'; sampleRate: number }
  | { type: 'result'; segments: DiarizedSegment[] }
  | { type: 'error'; message: string }

type DiarizationListener = (event: DiarizationEvent) => void

const STORAGE_KEY = 'sonabrief_diarization_enabled'
const MIN_MEMORY_GB = 8
const MIN_CORES = 4

// Stato globale condiviso tra tutte le istanze
const _global = {
  sd: null as any,
  sampleRate: 16000,
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

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return }
    const s = document.createElement('script')
    s.src = src
    s.onload = () => resolve()
    s.onerror = () => reject(new Error(`Failed to load ${src}`))
    document.head.appendChild(s)
  })
}

async function loadModels() {
  if (_global.ready || _global.loading) return
  _global.loading = true
  post({ type: 'loading' })

  await new Promise(r => setTimeout(r, 50))

  try {
    await loadScript('/sherpa-diarization/sherpa-onnx-speaker-diarization.js')

    await new Promise<void>((resolve, reject) => {
      ;(window as any).Module = {
        locateFile: (f: string) => `/sherpa-diarization/${f}`,
        onRuntimeInitialized: () => {
          try {
            const sd = (window as any).createOfflineSpeakerDiarization((window as any).Module)
            _global.sd = sd
            _global.sampleRate = sd.sampleRate
            _global.ready = true
            resolve()
          } catch (e) {
            reject(e)
          }
        },
        print: () => {},
        printErr: () => {},
      }
      loadScript('/sherpa-diarization/sherpa-onnx-wasm-main-speaker-diarization.js').catch(reject)
    })

    post({ type: 'ready', sampleRate: _global.sampleRate })
  } catch (err) {
    _global.loading = false
    post({ type: 'error', message: err instanceof Error ? err.message : 'Load failed' })
  }
}

async function diarize(audio: Float32Array, numSpeakers = -1, threshold = 0.5): Promise<DiarizedSegment[] | null> {
  if (!_global.sd) { return null }
  await new Promise(r => setTimeout(r, 0))
  let raw
  try {
    raw = _global.sd.process(audio, numSpeakers, threshold)
  } catch(e) {
    console.error('[diarization] process error:', e)
    return null
  }
  if (!raw || !Array.isArray(raw) || raw.length === 0) return null
  return raw.map((s: any) => ({
    start: Number(s.start),
    end: Number(s.end),
    speaker: Number(s.speaker),
  }))
}

function on(listener: DiarizationListener) {
  _global.listeners.add(listener)
  return () => _global.listeners.delete(listener)
}

// API pubblica
export const diarization = {
  load: loadModels,
  diarize,
  on,
  get isReady() { return _global.ready },
  get sampleRate() { return _global.sampleRate },
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