import { pipeline, env } from '@huggingface/transformers'

env.allowLocalModels = false
env.useBrowserCache = true

// ─── ORT setup ───────────────────────────────────────────────────────
// NOTA: in passato si era tentato di forzare la variante threaded di ORT
// (ort-wasm-simd-threaded.{mjs,wasm}) per abilitare il multi-thread reale.
// Sul bundle dev di ORT 1.26.0-dev.20260416-b7804b056c questo causa hang
// nella creazione della SECONDA session (mel matmul lazy in
// _extract_fbank_features), bloccando del tutto la trascrizione.
// Quindi torniamo al default asyncify di transformers (single-thread ma
// stabile). Il guadagno di velocità per Whisper Small su Intel UHD va
// affrontato a livello di model size (Tiny/Base) non di threading.

// Diagnostica runtime (bracket-access su globalThis per resistere al minifier)
const _g = globalThis as Record<string, unknown>
console.log('[Whisper][diag]', {
  crossOriginIsolated: _g['crossOriginIsolated'],
  hasSharedArrayBuffer: typeof _g['SharedArrayBuffer'] === 'function',
  hardwareConcurrency: navigator.hardwareConcurrency,
})

// numThreads resta settato: con asyncify viene ignorato ma è innocuo
// @ts-ignore
env.backends.onnx.wasm.numThreads = Math.min(navigator.hardwareConcurrency ?? 1, 4)

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
  // q4 funziona ovunque (file del modello stabile); q8 su WASM dava
  // qdq_actions.cc:137 TransposeDQWeightsForMatMulNBits "Missing required scale"
  // con la variante threaded di ORT 1.26.0-dev. Il guadagno vero qui è il
  // multi-thread reale (4 core invece di 1 asyncify), non il dtype.
  const dtype = device === 'webgpu'
    ? { encoder_model: 'q4', decoder_model_merged: 'q4' } as const
    : 'q4'

  const progressCb = (p: { status: string; progress?: number; file?: string }) => {
    if (p.status === 'downloading' || p.status === 'loading') {
      post({ type: 'loading', progress: Math.round(p.progress ?? 0), file: p.file ?? '' })
    }
  }

  console.log('[Whisper][timing] pipeline() start, device:', device, 'dtype:', dtype)
  const tPipe = performance.now()
  transcriber = await pipeline('automatic-speech-recognition', model, {
    device, dtype, progress_callback: progressCb,
  })
  console.log(`[Whisper][timing] pipeline() ready in ${Math.round(performance.now() - tPipe)}ms`)

  // Verifica che ORT non abbia fatto silent-fallback a numThreads=1
  console.log('[Whisper][diag] post-pipeline ORT state:', {
    // @ts-ignore
    numThreads: env.backends.onnx.wasm.numThreads,
    // @ts-ignore
    wasmPaths: env.backends.onnx.wasm.wasmPaths,
    // @ts-ignore
    proxy: env.backends.onnx.wasm.proxy,
  })

  post({ type: 'ready' })
}

async function transcribe(audio: Float32Array, language?: string) {
  if (!transcriber) throw new Error('Model not loaded')
  post({ type: 'transcribing' })
  const durationS = Math.round(audio.length / 16000)
  console.log('[Whisper] inizio trascrizione, audio samples:', audio.length, 'durata stimata:', durationS, 's')

  // Streamer minimale per contare token e tempi — identifica hang vs lentezza
  let tokensCount = 0
  let lastTokenLog = performance.now()
  const tStart = performance.now()
  const streamer = {
    put(value: bigint[][]) {
      tokensCount += value[0]?.length ?? 0
      const now = performance.now()
      if (now - lastTokenLog > 1000) {
        lastTokenLog = now
        const elapsedS = (now - tStart) / 1000
        console.log(`[Whisper][stream] +${elapsedS.toFixed(1)}s — tokens generati: ${tokensCount} (${(tokensCount / elapsedS).toFixed(1)} tok/s)`)
      }
    },
    end() {
      const elapsedS = (performance.now() - tStart) / 1000
      console.log(`[Whisper][stream] end — totale tokens: ${tokensCount} in ${elapsedS.toFixed(1)}s (${(tokensCount / elapsedS).toFixed(1)} tok/s)`)
    },
  }

  const options: Record<string, unknown> = {
    return_timestamps: true,
    chunk_length_s: 30,
    stride_length_s: 5,
    streamer,
  }
  if (language) options.language = language
  // @ts-ignore
  const result = await transcriber(audio, options)
  const elapsedS = (performance.now() - tStart) / 1000
  console.log(`[Whisper][timing] trascrizione completata in ${elapsedS.toFixed(1)}s (audio: ${durationS}s, ratio: ${(elapsedS / Math.max(durationS, 1)).toFixed(2)}x real-time, ${tokensCount} tokens)`)
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