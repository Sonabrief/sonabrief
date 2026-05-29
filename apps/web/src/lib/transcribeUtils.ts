import { getHardwareTier } from './whisperModel'

export function estimateTranscriptionMinutes(audioMinutes: number): number {
  const tier = getHardwareTier()
  const multipliers = {
    ultrafast: 0.2,
    fast: 0.25,
    medium: 0.9,
    slow: 2.5,
  }
  return Math.ceil(audioMinutes * multipliers[tier] * 1.2)
}
