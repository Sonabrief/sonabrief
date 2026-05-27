import { pipeline, env } from '@huggingface/transformers'

env.allowLocalModels = false
env.useBrowserCache = true

// Diagnostica COI/SAB dentro il worker (può differire dal main thread)
const SAB_OK = typeof SharedArrayBuffer !== 'undefined'
const COI_OK = (self as unknown as { crossOriginIsolated?: boolean }).crossOriginIsolated === true
console.log('[Whisper][diag] worker context:', {
  crossOriginIsolated: COI_OK,
  hasSharedArrayBuffer: SAB_OK,
  hardwareConcurrency: navigator.hardwareConcurrency,
})

// Transformers v4.2.0 importa onnxruntime-web/webgpu che hardcoda
// "ort-wasm-simd-threaded.asyncify.mjs" — single-thread (asyncify non usa pthreads).
// Override esplicito su variante threaded reale (richiede COI + SAB).
{
  // @ts-ignore
  const ortVersion = (env.backends.onnx as any).versions?.web ?? '1.26.0'
  const wasmPathPrefix = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ortVersion}/dist/`
  console.log('[Whisper][diag] ORT version detected:', ortVersion)

  if (COI_OK && SAB_OK) {
    // @ts-ignore
    env.backends.onnx.wasm.wasmPaths = {
      mjs: `${wasmPathPrefix}ort-wasm-simd-threaded.mjs`,
      wasm: `${wasmPathPrefix}ort-wasm-simd-threaded.wasm`,
    }
    console.log('[Whisper][diag] wasmPaths OVERRIDDEN to threaded:',
      // @ts-ignore
      (env.backends.onnx as any).wasm.wasmPaths,
    )
  } else {
    console.warn('[Whisper][diag] COI o SAB mancanti: resto su asyncify single-thread')
  }
}

// @ts-ignore
env.backends.onnx.wasm.numThreads = Math.min(navigator.hardwareConcurrency ?? 1, 4)
console.log('[Whisper][diag] numThreads set to:',
  // @ts-ignore
  (env.backends.onnx as any).wasm.numThreads,
)

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
  // Rilascia la sessione ORT precedente per evitare doppia allocazione su fallback Large→Small
  if (transcriber) {
    try { await (transcriber as { dispose?: () => Promise<void> }).dispose?.() } catch { /* ignora */ }
    transcriber = null
  }

  // Intel GPU integrata è più lenta di WASM multi-thread per Whisper
  // WebGPU conviene solo con GPU discrete (NVIDIA/AMD)
  let device: 'webgpu' | 'wasm' = 'wasm'
  try {
    if ('gpu' in navigator) {
      const adapter = await navigator.gpu.requestAdapter()
      if (adapter) {
        const info = (adapter as any).info ?? {}
        const vendor = (info.vendor ?? '').toLowerCase()
        const isIntegrated = vendor.includes('intel') || vendor.includes('microsoft')
        if (!isIntegrated) {
          device = 'webgpu'
          console.log('[Whisper] GPU dedicata rilevata, uso WebGPU')
        } else {
          console.log('[Whisper] GPU integrata Intel/Microsoft, uso WASM multi-thread (più veloce)')
        }
      }
    }
  } catch {
    console.log('[Whisper] WebGPU non disponibile, uso WASM')
  }
  // q4 su WebGPU vince per memory bandwidth; su WASM CPU q8 è ~25-35% più veloce
  // (no unpacking 4-bit per token, nessun kernel q4 ottimizzato lato CPU)
  const dtype = device === 'webgpu'
    ? { encoder_model: 'q4', decoder_model_merged: 'q4' } as const
    : 'q8'
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
  console.log('[Whisper] inizio trascrizione, audio samples:', audio.length, 'durata stimata:', Math.round(audio.length / 16000), 's')
  const options: Record<string, unknown> = {
    return_timestamps: true,
    chunk_length_s: 30,
    stride_length_s: 5,
  }
  if (language) options.language = language
  // @ts-ignore
  const result = await transcriber(audio, options)
  console.log('[Whisper] trascrizione completata')
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