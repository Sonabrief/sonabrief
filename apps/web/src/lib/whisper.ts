import { resolveWhisperModel, detectWhisperModel, WHISPER_SMALL, WHISPER_LARGE } from './whisperModel'

export type WhisperModel =
  | 'Xenova/whisper-tiny'
  | 'Xenova/whisper-base'
  | 'Xenova/whisper-small'
  | 'onnx-community/whisper-large-v3-turbo'

export type WhisperEvent =
  | { type: 'loading'; progress: number; file: string }
  | { type: 'ready' }
  | { type: 'transcribing' }
  | { type: 'result'; text: string; segments: unknown[] }
  | { type: 'chunk_result'; text: string; segments: unknown[]; batchId: string }
  | { type: 'error'; message: string }
  | { type: 'model_info'; model: string; auto: boolean; hardwareFallback: boolean }

type Listener = (event: WhisperEvent) => void

class WhisperService {
  private worker: Worker | null = null
  private listeners: Set<Listener> = new Set()
  private currentModel: string | null = null
  private isLargeFailed = false

  init() {
    if (this.worker) return
    this.worker = new Worker(
      new URL('../workers/whisper.worker.ts', import.meta.url),
      { type: 'module' }
    )
    this.worker.onmessage = (e: MessageEvent<WhisperEvent>) => {
      if (
        e.data.type === 'error' &&
        this.currentModel === WHISPER_LARGE &&
        !this.isLargeFailed
      ) {
        const msg = (e.data as { type: 'error'; message: string }).message.toLowerCase()
        if (
          msg.includes('out of memory') ||
          msg.includes('oom') ||
          msg.includes('allocation failed')
        ) {
          this.isLargeFailed = true
          console.warn('[Whisper] OOM con Large-v3-turbo, fallback a Small')
          this._loadModel(WHISPER_SMALL, true)
          return
        }
      }
      this.listeners.forEach(fn => fn(e.data))
    }
  }

  private _loadModel(model: string, hardwareFallback = false) {
    this.currentModel = model
    const auto = !localStorage.getItem('whisper_model_override')
    this.worker?.postMessage({ action: 'load', payload: { model } })
    setTimeout(() => {
      this.listeners.forEach(fn =>
        fn({ type: 'model_info', model, auto, hardwareFallback })
      )
    }, 0)
  }

  loadAuto() {
    const model = resolveWhisperModel()
    this._loadModel(model, false)
  }

  /** @deprecated usa loadAuto() */
  load(model: WhisperModel = 'Xenova/whisper-base') {
    this._loadModel(model)
  }

  transcribe(audio: Float32Array, language?: string) {
    this.worker?.postMessage({ action: 'transcribe', payload: { audio, language } })
  }

  transcribeChunk(audio: Float32Array, language: string, batchId: string) {
    this.worker?.postMessage({ action: 'transcribe_chunk', payload: { audio, language, batchId } })
  }

  on(listener: Listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getCurrentModel() { return this.currentModel }
  isFallbackActive() { return this.isLargeFailed }
  isLargeModel() { return this.currentModel === WHISPER_LARGE }

  destroy() {
    this.worker?.terminate()
    this.worker = null
    this.listeners.clear()
    this.currentModel = null
    this.isLargeFailed = false
  }
}

export const whisper = new WhisperService()