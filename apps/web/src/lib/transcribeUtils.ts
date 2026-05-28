import { getHardwareTier } from './whisperModel'

export function estimateTranscriptionMinutes(audioMinutes: number): number {
  const tier = getHardwareTier()
  const multipliers = {
    fast: 0.3,
    medium: 0.8,
    slow: 2.2,
  }
  return Math.ceil(audioMinutes * multipliers[tier])
}
