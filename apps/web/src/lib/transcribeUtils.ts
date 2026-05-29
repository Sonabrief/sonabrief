import { getHardwareTier } from './whisperModel'

export function estimateTranscriptionMinutes(audioMinutes: number): number {
  const tier = getHardwareTier()
  const multipliers = {
    ultrafast: 0.3,
    fast: 0.6,
    medium: 2.0,
    slow: 3.0,
  }
  return Math.ceil(audioMinutes * multipliers[tier] * 1.2)
}
