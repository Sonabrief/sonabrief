export type EmbeddingEvent =
  | { type: 'ready' }
  | { type: 'result'; id: string; vector: number[] }
  | { type: 'error'; message: string }

type Listener = (event: EmbeddingEvent) => void

class EmbeddingsService {
  private worker: Worker | null = null
  private listeners: Set<Listener> = new Set()
  private ready = false
  private queue: Array<{ id: string; text: string }> = []

  init() {
    if (this.worker) return
    this.worker = new Worker(
      new URL('../workers/embeddings.worker.ts', import.meta.url),
      { type: 'module' }
    )
    this.worker.onmessage = (e: MessageEvent<EmbeddingEvent>) => {
      if (e.data.type === 'ready') {
        this.ready = true
        this.queue.forEach(item => this.embed(item.id, item.text))
        this.queue = []
      }
      this.listeners.forEach(fn => fn(e.data))
    }
    this.worker.postMessage({ action: 'load' })
  }

  embed(id: string, text: string) {
    if (!this.ready) {
      this.queue.push({ id, text })
      return
    }
    this.worker?.postMessage({ action: 'embed', payload: { id, text } })
  }

  on(listener: Listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  destroy() {
    this.worker?.terminate()
    this.worker = null
    this.listeners.clear()
    this.ready = false
    this.queue = []
  }
}

export const embeddingsService = new EmbeddingsService()
