import { useState, useCallback, useEffect } from 'react'

export type ModelKey = 'base' | 'advanced' | 'professional' | 'max'

export type SetupStep =
  | 'detecting'
  | 'not-found'
  | 'model-select'
  | 'downloading'
  | 'ready'
  | 'error'

export interface ModelConfig {
  id: string
  label: string
  sizeGB: number
  ramGB: number
  description: string
  compatible: string
}

export const MODELS: Record<ModelKey, ModelConfig> = {
  base: {
    id: 'llama3.2:3b',
    label: 'Base',
    sizeGB: 2,
    ramGB: 8,
    description: 'Meeting brevi, linguaggio quotidiano',
    compatible: 'Qualsiasi PC/Mac recente',
  },
  advanced: {
    id: 'llama3.1:8b',
    label: 'Avanzato',
    sizeGB: 5,
    ramGB: 16,
    description: 'Meeting lunghi, terminologia professionale',
    compatible: 'PC/Mac con 16 GB RAM',
  },
  professional: {
    id: 'qwen2.5:14b',
    label: 'Professionale',
    sizeGB: 9,
    ramGB: 16,
    description: 'Documenti complessi, alta precisione',
    compatible: 'PC/Mac con 16 GB RAM',
  },
  max: {
    id: 'qwen2.5:32b',
    label: 'Massimo',
    sizeGB: 20,
    ramGB: 32,
    description: 'Qualità equivalente ai migliori servizi cloud',
    compatible: 'Solo workstation/Mac Pro',
  },
}

function getSuggestedModel(ram: number): ModelKey {
  if (ram < 8) return 'base'
  if (ram < 16) return 'advanced'
  if (ram < 32) return 'professional'
  return 'max'
}

export interface OllamaSetupState {
  step: SetupStep
  detectedRAM: number
  suggestedModel: ModelKey
  selectedModel: ModelKey
  downloadProgress: number
  ollamaVersion: string | null
  errorMessage: string | null
}

export interface OllamaSetupActions {
  detectOllama: () => Promise<void>
  selectModel: (model: ModelKey) => void
  startDownload: () => Promise<void>
  retry: () => void
}

export function useOllamaSetup({ autoDetect = true }: { autoDetect?: boolean } = {}): OllamaSetupState & OllamaSetupActions {
  const detectedRAM = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8
  const suggestedModel = getSuggestedModel(detectedRAM)

  const [step, setStep] = useState<SetupStep>('detecting')
  const [selectedModel, setSelectedModel] = useState<ModelKey>(suggestedModel)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [ollamaVersion, setOllamaVersion] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const detectOllama = useCallback(async () => {
    setStep('detecting')
    setErrorMessage(null)
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 3000)
      const res = await fetch('http://localhost:11434/api/version', {
        signal: controller.signal,
      })
      clearTimeout(timeout)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as { version?: string }
      setOllamaVersion(data.version ?? null)

      const readyController = new AbortController()
      const readyTimeout = setTimeout(() => readyController.abort(), 3000)
      const readyRes = await fetch('http://localhost:11434/api/tags', {
        signal: readyController.signal,
      })
      clearTimeout(readyTimeout)
      if (!readyRes.ok) throw new Error(`Not ready: HTTP ${readyRes.status}`)

      setStep('model-select')
    } catch {
      setStep('not-found')
    }
  }, [])

  const selectModel = useCallback((model: ModelKey) => {
    setSelectedModel(model)
  }, [])

  const startDownload = useCallback(async () => {
    setStep('downloading')
    setDownloadProgress(0)

    const modelId = MODELS[selectedModel].id

    try {
      const res = await fetch('http://localhost:11434/api/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelId, stream: true }),
      })

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const event = JSON.parse(line) as {
              status?: string
              total?: number
              completed?: number
            }
            if (
              typeof event.total === 'number' &&
              typeof event.completed === 'number' &&
              event.total > 0
            ) {
              setDownloadProgress(Math.round((event.completed / event.total) * 100))
            }
          } catch {
            // ignora righe NDJSON malformate
          }
        }
      }

      setDownloadProgress(100)
      localStorage.setItem('sonabrief_ollama_model', modelId)
      setStep('ready')
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Download fallito')
      setStep('error')
    }
  }, [selectedModel])

  const retry = useCallback(() => {
    detectOllama()
  }, [detectOllama])

  useEffect(() => {
    if (autoDetect) detectOllama()
  }, [detectOllama, autoDetect])

  return {
    step,
    detectedRAM,
    suggestedModel,
    selectedModel,
    downloadProgress,
    ollamaVersion,
    errorMessage,
    detectOllama,
    selectModel,
    startDownload,
    retry,
  }
}
