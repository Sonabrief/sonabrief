import { pipeline, env } from '@huggingface/transformers'

env.allowLocalModels = false
env.useBrowserCache = true

function isIntelGPU(): boolean {
  try {
    const canvas = new OffscreenCanvas(1, 1)
    const gl = canvas.getContext('webgl') as WebGLRenderingContext | null
    if (!gl) return false
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    if (!ext) return false
    const renderer = (gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string).toLowerCase()
    return renderer.includes('intel')
  } catch {
    return false
  }
}

const IS_INTEL = isIntelGPU()

type WhisperStatus =
  | { type: 'loading'; progress: number; file: string }
  | { type: 'ready' }
  | { type: 'transcribing' }
  | { type: 'result'; text: string; segments: unknown[] }
  | { type: 'chunk_result'; text: string; segments: unknown[]; batchId: string }
  | { type: 'chunk_progress'; processed: number; total: number }
  | { type: 'error'; message: string }

const post = (msg: WhisperStatus) => self.postMessage(msg)

// @ts-ignore
let transcriber: Awaited<ReturnType<typeof pipeline>> | null = null

self.addEventListener('unhandledrejection', (e) => {
  const msg = e.reason instanceof Error ? e.reason.message : String(e.reason)
  post({ type: 'error', message: msg })
})

async function loadModel(model: string) {
  if (transcriber) {
    try { await (transcriber as { dispose?: () => Promise<void> }).dispose?.() } catch { /* ignora */ }
    transcriber = null
  }

  // WebGPU ovunque disponibile: con COI=true il backend JSEP threaded usa thread
  // anche per le operazioni CPU-side (mel spectrogram, ecc.).
  // WASM puro solo dove WebGPU non è disponibile, con q8 + tutti i thread.
  const hasWebGPU = 'gpu' in navigator
  const device = hasWebGPU ? 'webgpu' : 'wasm'
  // q4f16 encoder on WebGPU: quantised weights with fp16 compute, faster than
  // pure fp16 with similar quality. WASM keeps q4 for both.
  const dtype = hasWebGPU
    ? { encoder_model: 'q4f16', decoder_model_merged: 'q4' } as const
    : { encoder_model: 'q4', decoder_model_merged: 'q4' } as const

  const threads = navigator.hardwareConcurrency ?? 2
  if (!hasWebGPU) {
    // @ts-ignore
    env.backends.onnx.wasm.numThreads = threads
  }

  console.log(`[Whisper] device=${device} dtype=${JSON.stringify(dtype)} intel=${IS_INTEL} threads=${hasWebGPU ? 'n/a(webgpu)' : threads} crossOriginIsolated=${self.crossOriginIsolated}`)

  transcriber = await pipeline('automatic-speech-recognition', model, {
    device,
    dtype,
    progress_callback: (p: { status: string; progress?: number; file?: string }) => {
      if (p.status === 'downloading' || p.status === 'loading') {
        post({ type: 'loading', progress: Math.round(p.progress ?? 0), file: p.file ?? '' })
      }
    },
  })
  post({ type: 'ready' })
}

async function transcribe(audio: Float32Array, language?: string) {
  if (!transcriber) throw new Error('Model not loaded')
  post({ type: 'transcribing' })
  const options: Record<string, unknown> = {
    return_timestamps: true,
    chunk_length_s: 30,
    stride_length_s: 5,
  }
  if (language) options.language = language
  // @ts-ignore
  const result = await transcriber(audio, options)
  const output = Array.isArray(result) ? result[0] : result
  post({
    type: 'result',
    text: (output as { text?: string }).text ?? '',
    segments: (output as { chunks?: unknown[] }).chunks ?? [],
  })
}

self.onmessage = async (e: MessageEvent) => {
  const { action, payload } = e.data
  try {
    if (action === 'load') await loadModel(payload.model)
    if (action === 'transcribe') await transcribe(payload.audio, payload.language)
    if (action === 'transcribe_chunk') {
      const { audio, language, batchId } = payload
      if (!transcriber) throw new Error('Model not loaded')
      // @ts-ignore
      const result = await transcriber(audio, {
        return_timestamps: true,
        language,
      })
      const output = Array.isArray(result) ? result[0] : result
      post({
        type: 'chunk_result',
        text: (output as { text?: string }).text ?? '',
        segments: (output as { chunks?: unknown[] }).chunks ?? [],
        batchId,
      })
    }
  } catch (err) {
    post({
      type: 'error',
      message: err instanceof Error ? err.message : 'Unknown error',
    })
  }
}
