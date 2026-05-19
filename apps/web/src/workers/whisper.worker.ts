import { pipeline, env } from '@huggingface/transformers'

env.allowLocalModels = false
env.useBrowserCache = true
// @ts-ignore
env.backends.onnx.wasm.numThreads = 1

type WhisperStatus =
  | { type: 'loading'; progress: number; file: string }
  | { type: 'ready' }
  | { type: 'transcribing' }
  | { type: 'result'; text: string; segments: unknown[] }
  | { type: 'error'; message: string }

// @ts-ignore
let transcriber: Awaited<ReturnType<typeof pipeline>> | null = null

async function loadModel(model: string) {
  transcriber = await pipeline('automatic-speech-recognition', model, {
    dtype: 'fp32',
    progress_callback: (p: { status: string; progress?: number; file?: string }) => {
      if (p.status === 'downloading' || p.status === 'loading') {
        self.postMessage({
          type: 'loading',
          progress: Math.round(p.progress ?? 0),
          file: p.file ?? '',
        } satisfies WhisperStatus)
      }
    },
  })
  self.postMessage({ type: 'ready' } satisfies WhisperStatus)
}

async function transcribe(audio: Float32Array, language?: string) {
  if (!transcriber) throw new Error('Model not loaded')
  self.postMessage({ type: 'transcribing' } satisfies WhisperStatus)
  const result = await transcriber(audio, {
    return_timestamps: true,
    ...(language ? { language } : {}),
  })
  const output = Array.isArray(result) ? result[0] : result
  self.postMessage({
    type: 'result',
    text: (output as { text?: string }).text ?? '',
    segments: (output as { chunks?: unknown[] }).chunks ?? [],
  } satisfies WhisperStatus)
}

self.onmessage = async (e: MessageEvent) => {
  const { action, payload } = e.data
  try {
    if (action === 'load') await loadModel(payload.model)
    if (action === 'transcribe') await transcribe(payload.audio, payload.language)
  } catch (err) {
    self.postMessage({
      type: 'error',
      message: err instanceof Error ? err.message : 'Unknown error',
    } satisfies WhisperStatus)
  }
}