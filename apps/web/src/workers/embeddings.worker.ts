import { pipeline, env } from '@huggingface/transformers'

env.allowLocalModels = false
env.useBrowserCache = true
// @ts-ignore
env.backends.onnx.wasm.numThreads = 1

type EmbeddingStatus =
  | { type: 'ready' }
  | { type: 'result'; id: string; vector: number[] }
  | { type: 'error'; message: string }

// @ts-ignore
let embedder: Awaited<ReturnType<typeof pipeline>> | null = null

async function loadModel() {
  embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
    dtype: 'fp32',
  })
  self.postMessage({ type: 'ready' } satisfies EmbeddingStatus)
}

async function embed(id: string, text: string) {
  if (!embedder) throw new Error('Model not loaded')
  // @ts-ignore
  const output = await embedder(text, { pooling: 'mean', normalize: true })
  const vector = Array.from((output as any).data as Float32Array)
  self.postMessage({ type: 'result', id, vector } satisfies EmbeddingStatus)
}

self.onmessage = async (e: MessageEvent) => {
  const { action, payload } = e.data
  try {
    if (action === 'load') await loadModel()
    if (action === 'embed') await embed(payload.id, payload.text)
  } catch (err) {
    self.postMessage({
      type: 'error',
      message: err instanceof Error ? err.message : 'Unknown error',
    } satisfies EmbeddingStatus)
  }
}
