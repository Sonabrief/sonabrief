export type WhisperModel = 'Xenova/whisper-tiny' | 'Xenova/whisper-base' | 'Xenova/whisper-small'

export type WhisperEvent =
  | { type: 'loading'; progress: number; file: string }
  | { type: 'ready' }
  | { type: 'transcribing' }
  | { type: 'result'; text: string; segments: unknown[] }
  | { type: 'error'; message: string }

type Listener = (event: WhisperEvent) => void

class WhisperService {
  private worker: Worker | null = null
  private listeners: Set<Listener> = new Set()

  init() {
    if (this.worker) return
    this.worker = new Worker(
      new URL('../workers/whisper.worker.ts', import.meta.url),
      { type: 'module' }
    )
    this.worker.onmessage = (e: MessageEvent<WhisperEvent>) => {
      this.listeners.forEach(fn => fn(e.data))
    }
  }

  load(model: WhisperModel = 'Xenova/whisper-base') {
    this.worker?.postMessage({ action: 'load', payload: { model } })
  }

  transcribe(audio: Float32Array, language?: string) {
    this.worker?.postMessage({ action: 'transcribe', payload: { audio, language } })
  }

  on(listener: Listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  destroy() {
    this.worker?.terminate()
    this.worker = null
    this.listeners.clear()
  }
}

export const whisper = new WhisperService()