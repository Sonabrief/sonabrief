import { useMemo } from 'react'

export interface WhisperSegment {
  timestamp: [number, number | null]
  text: string
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = Math.floor(seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

interface Props {
  segments: WhisperSegment[]
  rawText?: string
}

export function TranscriptViewer({ segments, rawText }: Props) {
  const lines = useMemo(() =>
    segments.map(s => ({ time: s.timestamp[0], text: s.text.trim() })).filter(s => s.text),
    [segments]
  )

  if (lines.length === 0) {
    return (
      <div className="w-full max-w-xl bg-gray-50 rounded-lg p-4 text-sm text-gray-700 whitespace-pre-wrap">
        {rawText ?? ''}
      </div>
    )
  }

  return (
    <div className="w-full max-w-xl flex flex-col gap-2">
      {lines.map((line, i) => (
        <div key={i} className="flex gap-3">
          <span className="text-xs text-gray-400 font-mono mt-0.5 shrink-0 w-10">
            {formatTimestamp(line.time)}
          </span>
          <p className="flex-1 text-sm text-gray-700 leading-relaxed">
            {line.text}
          </p>
        </div>
      ))}
    </div>
  )
}
