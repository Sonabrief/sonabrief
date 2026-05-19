export interface WhisperSegment {
  timestamp: [number, number | null]
  text: string
}

export interface SpeakerTurn {
  speaker: string      // "Interlocutore 1", "Interlocutore 2", ecc.
  speakerIndex: number
  startSeconds: number
  lines: string[]
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = Math.floor(seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

/**
 * Rileva i cambi di speaker dai gap temporali tra segmenti.
 * Logica: gap > threshold secondi = probabile cambio speaker.
 * Segmenti consecutivi dello stesso speaker vengono raggruppati.
 */
export function detectSpeakerTurns(
  segments: WhisperSegment[],
  gapThreshold = 1.5
): SpeakerTurn[] {
  if (segments.length === 0) return []

  const turns: SpeakerTurn[] = []
  let currentSpeakerIndex = 0
  let currentLines: string[] = []
  let currentStart = segments[0].timestamp[0] ?? 0
  let lastEnd = segments[0].timestamp[1] ?? segments[0].timestamp[0]

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    const segStart = seg.timestamp[0] ?? 0
    const segEnd = seg.timestamp[1] ?? segStart
    const text = seg.text.trim()
    if (!text) continue

    const gap = i > 0 ? segStart - (lastEnd ?? segStart) : 0

    if (i > 0 && gap > gapThreshold) {
      // Salva il turno corrente
      if (currentLines.length > 0) {
        turns.push({
          speaker: `Interlocutore ${currentSpeakerIndex + 1}`,
          speakerIndex: currentSpeakerIndex,
          startSeconds: currentStart,
          lines: currentLines,
        })
      }
      // Alterna speaker (logica base: gap = cambio)
      currentSpeakerIndex = (currentSpeakerIndex + 1) % 2
      currentLines = [text]
      currentStart = segStart
    } else {
      currentLines.push(text)
    }

    lastEnd = segEnd
  }

  // Ultimo turno
  if (currentLines.length > 0) {
    turns.push({
      speaker: `Interlocutore ${currentSpeakerIndex + 1}`,
      speakerIndex: currentSpeakerIndex,
      startSeconds: currentStart,
      lines: currentLines,
    })
  }

  return turns
}

export { formatTimestamp }
