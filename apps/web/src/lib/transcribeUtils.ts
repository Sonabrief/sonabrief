export function estimateTranscriptionMinutes(audioSeconds: number, mode: 'standard' | 'local' | 'cloud'): number {
  if (mode === 'cloud') return Math.max(0.5, audioSeconds * 0.05 / 60)
  const hasWebGPU = 'gpu' in navigator
  const cores = navigator.hardwareConcurrency ?? 4
  if (hasWebGPU && cores >= 8) return audioSeconds * 0.3 / 60
  if (hasWebGPU && cores >= 4) return audioSeconds * 0.5 / 60
  return audioSeconds * 2 / 60
}
