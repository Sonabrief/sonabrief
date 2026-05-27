import { pipeline, env } from '@huggingface/transformers'

env.allowLocalModels = false
env.useBrowserCache = true

// ─── ORT multi-thread setup ────────────────────────────────────────────
// Transformers v4.2.0 importa onnxruntime-web/webgpu che di default carica
// "ort-wasm-simd-threaded.asyncify.{mjs,wasm}" — variante SINGLE-THREAD
// (asyncify non usa pthreads, vedi cacheWasm.js commento esplicito).
// Risultato: env.backends.onnx.wasm.numThreads viene ignorato.
//
// IMPORTANTE: NON usare un check `if (canThread)` su `self.crossOriginIsolated`
// e `typeof SharedArrayBuffer`: oxc-minify (Rolldown) li valuta `false` a
// build-time (Node non ha COI) e dead-coda l'intero blocco.
// Soluzione: override INCONDIZIONATO; se il browser non ha COI/SAB,
// `pipeline()` fallisce e il fallback in loadModel() rimuove l'override
// e ricarica con i default asyncify.

// @ts-ignore – versions.web esiste a runtime ma non è tipato
const ORT_VERSION: string = (env.backends.onnx as any).versions?.web ?? '1.26.0'
const ORT_CDN = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`

// Diagnostica runtime: bracket-access su globalThis impedisce constant folding
const _g = globalThis as Record<string, unknown>
const RT_COI = _g['crossOriginIsolated']
const RT_SAB = _g['SharedArrayBuffer']
console.log('[Whisper][diag]', {
  ortVersion: ORT_VERSION,
  crossOriginIsolated: RT_COI,
  hasSharedArrayBuffer: typeof RT_SAB === 'function',
  hardwareConcurrency: navigator.hardwareConcurrency,
})

// Override INCONDIZIONATO — qualunque branch eliminerebbe l'effetto
// @ts-ignore
env.backends.onnx.wasm.wasmPaths = {
  mjs: `${ORT_CDN}ort-wasm-simd-threaded.mjs`,
  wasm: `${ORT_CDN}ort-wasm-simd-threaded.wasm`,
}
// @ts-ignore
env.backends.onnx.wasm.numThreads = Math.min(navigator.hardwareConcurrency ?? 1, 4)

console.log('[Whisper][diag] wasmPaths set to threaded:',
  // @ts-ignore
  env.backends.onnx.wasm.wasmPaths,
  // @ts-ignore
  'numThreads:', env.backends.onnx.wasm.numThreads,
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

  const progressCb = (p: { status: string; progress?: number; file?: string }) => {
    if (p.status === 'downloading' || p.status === 'loading') {
      post({ type: 'loading', progress: Math.round(p.progress ?? 0), file: p.file ?? '' })
    }
  }

  try {
    transcriber = await pipeline('automatic-speech-recognition', model, {
      device, dtype, progress_callback: progressCb,
    })
  } catch (err) {
    // Threaded variant ha fallito (probabile no COI/SAB nel browser).
    // Rimuovi l'override e riprova con i default asyncify single-thread.
    console.warn('[Whisper] threaded variant fallita, fallback ad asyncify:', err)
    // @ts-ignore
    delete env.backends.onnx.wasm.wasmPaths
    transcriber = await pipeline('automatic-speech-recognition', model, {
      device, dtype, progress_callback: progressCb,
    })
  }

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