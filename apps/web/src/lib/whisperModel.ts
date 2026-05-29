export type WhisperModelId =
  | 'onnx-community/whisper-large-v3-turbo'
  | 'Xenova/whisper-small'

export const WHISPER_LARGE = 'onnx-community/whisper-large-v3-turbo' as const
export const WHISPER_SMALL = 'Xenova/whisper-small' as const
export const STORAGE_KEY = 'whisper_model_override'

export function detectWhisperModel(): WhisperModelId {
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8
  const cores = navigator.hardwareConcurrency ?? 2
  return mem >= 8 && cores >= 4 ? WHISPER_LARGE : WHISPER_SMALL
}

export function getModelOverride(): WhisperModelId | null {
  const v = localStorage.getItem(STORAGE_KEY)
  if (v === WHISPER_LARGE || v === WHISPER_SMALL) return v
  return null
}

export function setModelOverride(model: WhisperModelId | null) {
  if (model === null) localStorage.removeItem(STORAGE_KEY)
  else localStorage.setItem(STORAGE_KEY, model)
}

export function resolveWhisperModel(): WhisperModelId {
  return getModelOverride() ?? detectWhisperModel()
}

export function getHardwareTier(): 'ultrafast' | 'fast' | 'medium' | 'slow' {
  const mem = (navigator as any).deviceMemory ?? 8
  const cores = navigator.hardwareConcurrency ?? 4
  // macOS with high specs → likely Apple Silicon (unified memory, fast inference).
  // Same specs on Windows/Linux still use slower x86 WASM, so they cap at 'medium'.
  const isMac = /Mac/i.test(navigator.platform) || /Mac OS X/i.test(navigator.userAgent)

  if (isMac && mem >= 16 && cores >= 10) return 'ultrafast' // M-series Pro/Max
  if (isMac && mem >= 8  && cores >= 8)  return 'fast'      // M1/M2 base
  if (mem < 4 || cores <= 2)             return 'slow'
  return 'medium'
}