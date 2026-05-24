import { useMemo, useState } from 'react'
import { formatTimestamp } from '../lib/speakers'
import type { WhisperSegment } from '../lib/speakers'

const SPEAKER_COLORS = [
  'text-teal-700 bg-teal-50 border-teal-200',
  'text-amber-700 bg-amber-50 border-amber-200',
  'text-violet-700 bg-violet-50 border-violet-200',
  'text-rose-700 bg-rose-50 border-rose-200',
  'text-sky-700 bg-sky-50 border-sky-200',
]

interface EnrichedSegment extends WhisperSegment {
  speaker?: number
}

interface SpeakerTurn {
  speaker: number
  startSeconds: number
  lines: string[]
}

interface Props {
  segments: EnrichedSegment[]
  rawText?: string
  diarSegments?: { start: number; end: number; speaker: number }[]
  initialSpeakerNames?: Record<number, string>
  onSpeakerNamesChange?: (names: Record<number, string>) => void
}

function buildTurnsFromEnriched(segments: EnrichedSegment[]): SpeakerTurn[] {
  if (segments.length === 0) return []
  const turns: SpeakerTurn[] = []
  let current: SpeakerTurn | null = null

  for (const seg of segments) {
    const text = seg.text.trim()
    if (!text) continue
    const speaker = seg.speaker ?? 0
    const start = seg.timestamp[0]

    if (!current || current.speaker !== speaker) {
      if (current) turns.push(current)
      current = { speaker, startSeconds: start, lines: [text] }
    } else {
      current.lines.push(text)
    }
  }
  if (current) turns.push(current)
  return turns
}

function buildTurnsFromGap(segments: WhisperSegment[]): SpeakerTurn[] {
  if (segments.length === 0) return []
  const turns: SpeakerTurn[] = []
  let currentSpeaker = 0
  let currentLines: string[] = []
  let currentStart = segments[0].timestamp[0]
  let lastEnd = segments[0].timestamp[1] ?? segments[0].timestamp[0]

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    const segStart = seg.timestamp[0]
    const segEnd = seg.timestamp[1] ?? segStart
    const text = seg.text.trim()
    if (!text) continue
    const gap = i > 0 ? segStart - (lastEnd ?? segStart) : 0
    if (i > 0 && gap > 1.5) {
      if (currentLines.length > 0) {
        turns.push({ speaker: currentSpeaker, startSeconds: currentStart, lines: currentLines })
      }
      currentSpeaker = (currentSpeaker + 1) % 2
      currentLines = [text]
      currentStart = segStart
    } else {
      currentLines.push(text)
    }
    lastEnd = segEnd
  }
  if (currentLines.length > 0) {
    turns.push({ speaker: currentSpeaker, startSeconds: currentStart, lines: currentLines })
  }
  return turns
}

export function TranscriptViewer({ segments, rawText, diarSegments = [], initialSpeakerNames = {}, onSpeakerNamesChange }: Props) {
  const [speakerNames, setSpeakerNames] = useState<Record<number, string>>(initialSpeakerNames)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')

  const hasDiarization = diarSegments.length > 0

  const turns = useMemo(() => {
    if (hasDiarization) return buildTurnsFromEnriched(segments)
    return buildTurnsFromGap(segments)
  }, [segments, hasDiarization])

  function getSpeakerLabel(index: number) {
    return speakerNames[index] ?? `Interlocutore ${index + 1}`
  }

  function startEdit(index: number) {
    setEditingIndex(index)
    setEditValue(getSpeakerLabel(index))
  }

  function commitEdit(index: number) {
    if (editValue.trim()) {
      const updated = { ...speakerNames, [index]: editValue.trim() }
      setSpeakerNames(updated)
      onSpeakerNamesChange?.(updated)
    }
    setEditingIndex(null)
  }

  if (turns.length === 0) {
    return (
      <div className="w-full max-w-xl bg-gray-50 rounded-lg p-4 text-sm text-gray-700 whitespace-pre-wrap">
        {rawText ?? ''}
      </div>
    )
  }

  return (
    <div className="w-full max-w-xl flex flex-col gap-4">
      <p className="text-xs text-gray-400">
        Clicca sul nome dell'interlocutore per rinominarlo.
        {hasDiarization && <span className="ml-1 text-primary">✓ Diarizzazione AI attiva</span>}
      </p>
      {turns.map((turn, i) => (
        <div key={i} className="flex gap-3">
          <span className="text-xs text-gray-400 font-mono mt-0.5 shrink-0 w-10">
            {formatTimestamp(turn.startSeconds)}
          </span>
          <div className="flex-1 flex flex-col gap-1">
            {editingIndex === turn.speaker ? (
              <input
                autoFocus
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={() => commitEdit(turn.speaker)}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitEdit(turn.speaker)
                  if (e.key === 'Escape') setEditingIndex(null)
                }}
                className="text-xs font-semibold rounded px-2 py-0.5 border w-40 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            ) : (
              <button
                onClick={() => startEdit(turn.speaker)}
                className={`self-start text-xs font-semibold rounded-full px-2 py-0.5 border transition-colors hover:opacity-70 ${SPEAKER_COLORS[turn.speaker % SPEAKER_COLORS.length]}`}
              >
                {getSpeakerLabel(turn.speaker)} ✎
              </button>
            )}
            <p className="text-sm text-gray-700 leading-relaxed">
              {turn.lines.join(' ')}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}