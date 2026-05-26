import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

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
      className="opacity-80"
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
  const { t } = useTranslation()
  const [notesValue, setNotesValue] = useState(initialNotes)

  return (
    <div className="flex flex-col gap-3 h-screen bg-background text-foreground p-4 box-border">

      {/* Timer + waveform */}
      <div className="flex items-center gap-2.5">
        <span className={`h-2.5 w-2.5 rounded-full bg-destructive shrink-0 ${
          paused ? 'opacity-40' : 'animate-pulse'
        }`} />
        <span className="font-mono text-2xl font-bold tabular-nums text-foreground tracking-tight">
          {formatDuration(duration)}
        </span>
        {paused
          ? <span className="text-xs text-muted-foreground">{t('pip_recorder.paused')}</span>
          : <PiPWaveform stream={stream} frozen={paused} />
        }
      </div>

      {/* Controls */}
      <div className="flex gap-2">
        <button
          onClick={paused ? onResume : onPause}
          className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-border"
        >
          {paused ? t('pip_recorder.resume') : t('pip_recorder.pause')}
        </button>
        <button
          onClick={onStop}
          className="flex-1 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/20"
        >
          {t('pip_recorder.stop')}
        </button>
      </div>

      {/* Notes */}
      <div className="flex flex-col gap-1.5 flex-1 min-h-0">
        <span className="text-xs font-medium text-muted-foreground">{t('pip_recorder.notes_label')}</span>
        <textarea
          value={notesValue}
          onChange={e => { setNotesValue(e.target.value); onNotesChange(e.target.value) }}
          placeholder={t('pip_recorder.notes_placeholder')}
          className="flex-1 resize-none rounded-md border border-border bg-card px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  )
}
