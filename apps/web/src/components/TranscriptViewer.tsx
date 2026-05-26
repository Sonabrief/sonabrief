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

export function segmentsToText(segments: WhisperSegment[], withTimestamps: boolean): string {
  if (!withTimestamps) return segments.map(s => s.text.trim()).filter(Boolean).join('\n')
  return segments
    .filter(s => s.text.trim())
    .map(s => `${formatTimestamp(s.timestamp[0])}  ${s.text.trim()}`)
    .join('\n')
}

interface Props {
  segments: WhisperSegment[]
  rawText?: string
  showTimestamps?: boolean
}

export function TranscriptViewer({ segments, rawText, showTimestamps = false }: Props) {
  const lines = useMemo(() =>
    segments.map(s => ({ time: s.timestamp[0], text: s.text.trim() })).filter(s => s.text),
    [segments]
  )

  const hasSegments = lines.length > 0

  return (
    <div className="flex flex-col gap-3 w-full">
      {!hasSegments ? (
        <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
          {rawText ?? ''}
        </div>
      ) : showTimestamps ? (
        <div className="flex flex-col gap-2">
          {lines.map((line, i) => (
            <div key={i} className="flex gap-3">
              <span className="text-xs text-muted-foreground font-mono mt-0.5 shrink-0 w-10">
                {formatTimestamp(line.time)}
              </span>
              <p className="flex-1 text-sm text-foreground leading-relaxed">{line.text}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-foreground leading-relaxed">
          {lines.map(l => l.text).join(' ')}
        </p>
      )}
    </div>
  )
}