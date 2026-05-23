import { useState } from 'react'

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

interface PiPRecorderProps {
  duration: number
  paused: boolean
  initialNotes: string
  onPause: () => void
  onResume: () => void
  onStop: () => void
  onNotesChange: (val: string) => void
}

export function PiPRecorder({
  duration, paused, initialNotes,
  onPause, onResume, onStop, onNotesChange,
}: PiPRecorderProps) {
  const [notesValue, setNotesValue] = useState(initialNotes)

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', height: '100vh', boxSizing: 'border-box', background: '#fff', color: '#111' }}>

      {/* Timer */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#e53e3e', display: 'inline-block', opacity: paused ? 0.4 : 1, animation: paused ? 'none' : 'pulse 1.5s infinite' }} />
        <span style={{ fontFamily: 'monospace', fontSize: 32, fontWeight: 700, letterSpacing: '-0.02em' }}>
          {formatDuration(duration)}
        </span>
        {paused && <span style={{ fontSize: 13, color: '#888' }}>— in pausa</span>}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={paused ? onResume : onPause}
          style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', background: '#f5f5f5', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
        >
          {paused ? '▶ Riprendi' : '⏸ Pausa'}
        </button>
        <button
          onClick={onStop}
          style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: 'none', background: '#e53e3e', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
        >
          ⏹ Stop
        </button>
      </div>

      {/* Notes */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#888' }}>Note</span>
        <textarea
          value={notesValue}
          onChange={e => {
            setNotesValue(e.target.value)
            onNotesChange(e.target.value)
          }}
          placeholder="Appunti liberi..."
          style={{ flex: 1, padding: '8px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: 13, resize: 'none', fontFamily: 'system-ui, sans-serif' }}
        />
      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  )
}
