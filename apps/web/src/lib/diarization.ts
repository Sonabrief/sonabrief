export interface DiarizedSegment {
  start: number
  end: number
  speaker: number
}

const STORAGE_KEY = 'sonabrief_diarization_enabled'
const MIN_MEMORY_GB = 16
const MIN_CORES = 8

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

type DiarizationListener = (event:
  | { type: 'loading' }
  | { type: 'ready'; sampleRate: number }
  | { type: 'result'; segments: DiarizedSegment[] }
  | { type: 'error'; message: string }
) => void

class DiarizationService {
  private listeners: Set<DiarizationListener> = new Set()
  private _sd: any = null
  private _sampleRate = 16000
  private _loading = false

  private post(event: Parameters<DiarizationListener>[0]) {
    this.listeners.forEach(fn => fn(event))
  }

  async load() {
    if (this._sd || this._loading) return
    this._loading = true
    this.post({ type: 'loading' })

    try {
      await this._loadScript('/sherpa-diarization/sherpa-onnx-speaker-diarization.js')

      await new Promise<void>((resolve, reject) => {
        ;(window as any).Module = {
          locateFile: (f: string) => `/sherpa-diarization/${f}`,
          onRuntimeInitialized: () => {
            try {
              this._sd = (window as any).createOfflineSpeakerDiarization((window as any).Module)
              this._sampleRate = this._sd.sampleRate
              resolve()
            } catch (e) {
              reject(e)
            }
          },
          print: () => {},
          printErr: () => {},
        }
        this._loadScript('/sherpa-diarization/sherpa-onnx-wasm-main-speaker-diarization.js').catch(reject)
      })

      this.post({ type: 'ready', sampleRate: this._sampleRate })
    } catch (err) {
      this.post({ type: 'error', message: err instanceof Error ? err.message : 'Load failed' })
    } finally {
      this._loading = false
    }
  }

  private _loadScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) { resolve(); return }
      const s = document.createElement('script')
      s.src = src
      s.onload = () => resolve()
      s.onerror = () => reject(new Error(`Failed to load ${src}`))
      document.head.appendChild(s)
    })
  }

  diarize(audio: Float32Array, numSpeakers = -1, threshold = 0.5): DiarizedSegment[] | null {
    if (!this._sd) return null
    try {
      if (numSpeakers > 0) {
        this._sd.setConfig({ clustering: { numClusters: numSpeakers, threshold } })
      } else {
        this._sd.setConfig({ clustering: { numClusters: -1, threshold } })
      }
      return this._sd.process(audio) as DiarizedSegment[]
    } catch (err) {
      this.post({ type: 'error', message: err instanceof Error ? err.message : 'Diarization failed' })
      return null
    }
  }

  get sampleRate() { return this._sampleRate }
  get isReady() { return !!this._sd }

  on(listener: DiarizationListener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}

export const diarization = new DiarizationService()

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
