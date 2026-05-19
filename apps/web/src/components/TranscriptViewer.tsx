import { useMemo, useState } from 'react'
import { detectSpeakerTurns, formatTimestamp } from '../lib/speakers'
import type { WhisperSegment } from '../lib/speakers'

const SPEAKER_COLORS = [
  'text-teal-700 bg-teal-50 border-teal-200',
  'text-amber-700 bg-amber-50 border-amber-200',
]

interface Props {
  segments: WhisperSegment[]
  /** Fallback: testo grezzo se non ci sono segmenti */
  rawText?: string
}

export function TranscriptViewer({ segments, rawText }: Props) {
  const [speakerNames, setSpeakerNames] = useState<Record<number, string>>({})
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')

  const turns = useMemo(() => detectSpeakerTurns(segments), [segments])

  function getSpeakerLabel(index: number) {
    return speakerNames[index] ?? `Interlocutore ${index + 1}`
  }

  function startEdit(index: number) {
    setEditingIndex(index)
    setEditValue(getSpeakerLabel(index))
  }

  function commitEdit(index: number) {
    if (editValue.trim()) {
      setSpeakerNames(prev => ({ ...prev, [index]: editValue.trim() }))
    }
    setEditingIndex(null)
  }

  // Fallback: nessun segmento
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
      </p>
      {turns.map((turn, i) => (
        <div key={i} className="flex gap-3">
          {/* Timestamp */}
          <span className="text-xs text-gray-400 font-mono mt-0.5 shrink-0 w-10">
            {formatTimestamp(turn.startSeconds)}
          </span>

          <div className="flex-1 flex flex-col gap-1">
            {/* Speaker badge */}
            {editingIndex === turn.speakerIndex ? (
              <input
                autoFocus
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={() => commitEdit(turn.speakerIndex)}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitEdit(turn.speakerIndex)
                  if (e.key === 'Escape') setEditingIndex(null)
                }}
                className="text-xs font-semibold rounded px-2 py-0.5 border w-40 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            ) : (
              <button
                onClick={() => startEdit(turn.speakerIndex)}
                className={`self-start text-xs font-semibold rounded-full px-2 py-0.5 border transition-colors hover:opacity-70 ${SPEAKER_COLORS[turn.speakerIndex % SPEAKER_COLORS.length]}`}
              >
                {getSpeakerLabel(turn.speakerIndex)} ✎
              </button>
            )}

            {/* Testo */}
            <p className="text-sm text-gray-700 leading-relaxed">
              {turn.lines.join(' ')}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
