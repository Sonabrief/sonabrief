import { useEffect, useRef, useState } from 'react'

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function PiPWaveform({ stream, frozen }: { stream: MediaStream | null; frozen: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const frozenRef = useRef(frozen)

  useEffect(() => { frozenRef.current = frozen }, [frozen])

  useEffect(() => {
    if (!stream) return
    const audioCtx = new AudioContext()
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 64
    audioCtx.createMediaStreamSource(stream).connect(analyser)

    const data = new Uint8Array(analyser.frequencyBinCount)
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const BAR_COUNT = 16
    const GAP = 2

    function draw() {
      if (!frozenRef.current) {
        analyser.getByteFrequencyData(data)
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        const barW = (canvas.width - GAP * (BAR_COUNT - 1)) / BAR_COUNT
        for (let i = 0; i < BAR_COUNT; i++) {
          const val = data[Math.floor(i * data.length / BAR_COUNT)] / 255
          const h = Math.max(3, val * canvas.height)
          const x = i * (barW + GAP)
          const y = (canvas.height - h) / 2
          ctx.fillStyle = `rgba(26, 77, 82, ${0.4 + val * 0.6})`
          ctx.beginPath()
          ctx.roundRect(x, y, barW, h, 2)
          ctx.fill()
        }
      }
      rafRef.current = requestAnimationFrame(draw)
    }
    draw()

    return () => {
      cancelAnimationFrame(rafRef.current)
      audioCtx.close()
    }
  }, [stream])

  return (
    <canvas
      ref={canvasRef}
      width={160}
      height={32}
      style={{ opacity: 0.8 }}
    />
  )
}

interface PiPRecorderProps {
  duration: number
  paused: boolean
  initialNotes: string
  stream?: MediaStream | null
  onPause: () => void
  onResume: () => void
  onStop: () => void
  onNotesChange: (val: string) => void
}

export function PiPRecorder({
  duration, paused, initialNotes, stream = null,
  onPause, onResume, onStop, onNotesChange,
}: PiPRecorderProps) {
  const [notesValue, setNotesValue] = useState(initialNotes)
  const [notesFocused, setNotesFocused] = useState(false)

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', height: '100vh', boxSizing: 'border-box', background: '#fff', color: '#111' }}>

      {/* Timer + waveform */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#e53e3e', display: 'inline-block', opacity: paused ? 0.4 : 1, animation: paused ? 'none' : 'pulse 1.5s infinite' }} />
        <span style={{ fontFamily: 'monospace', fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em' }}>
          {formatDuration(duration)}
        </span>
        {paused
          ? <span style={{ fontSize: 12, color: '#888' }}>— in pausa</span>
          : <PiPWaveform stream={stream} frozen={paused} />
        }
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
        <div style={{ flex: 1, position: 'relative' }}>
          {!notesFocused && notesValue === '' && (
            <p style={{
              position: 'absolute', top: 8, left: 10, right: 10,
              fontSize: 12, color: '#aaa', margin: 0, lineHeight: 1.4,
              pointerEvents: 'none'
            }}>
              Quello che scrivi qui verrà integrato nella sintesi AI.
            </p>
          )}
          <textarea
            value={notesValue}
            onChange={e => { setNotesValue(e.target.value); onNotesChange(e.target.value) }}
            onFocus={() => setNotesFocused(true)}
            onBlur={() => setNotesFocused(false)}
            style={{ width: '100%', height: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: 13, resize: 'none', fontFamily: 'system-ui, sans-serif', boxSizing: 'border-box', background: 'transparent' }}
          />
        </div>
      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  )
}
