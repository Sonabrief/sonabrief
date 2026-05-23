import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Mic, Monitor, Video } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAudioRecorder } from '../hooks/useAudioRecorder'
import { useChunkedTranscription } from '../hooks/useChunkedTranscription'
import { whisper } from '../lib/whisper'
import { Button } from '../components/ui/button'
import { API_URL } from '../config'
import { SynthesisEditor } from '../components/SynthesisEditor'
import { TranscriptViewer } from '../components/TranscriptViewer'
import type { WhisperSegment } from '../lib/speakers'
import { db } from '../lib/db'
import { synthesizeWithOllama } from '../lib/ollama'
import { syncMeetingNow } from '../lib/sync'
import { saveActionItemsFromNote } from '../lib/actionItems'
import { saveEmbeddingForMeeting } from '../lib/semanticSearch'
import { embeddingsService } from '../lib/embeddings'
import { isUnlocked } from '../lib/keystore'
import { MeetingBriefing } from '../components/MeetingBriefing'
import { ProGate } from '../components/ProGate'
import { AppNav } from '../components/AppNav'
import { RecoveryBanner } from '../components/RecoveryBanner'
import { exportMarkdown, exportPDF, exportWord, exportEmail, copyFormatted } from '../lib/export'
import { useTier } from '../hooks/useTier'
import { TagInput } from '../components/TagInput'

function ProGatedButton({ label, feature, onAction }: {
  label: string
  feature: string
  onAction: () => void
}) {
  const { isFree } = useTier()
  const [showTooltip, setShowTooltip] = useState(false)

  if (isFree) {
    return (
      <div className="relative">
        <button
          onClick={() => setShowTooltip(t => !t)}
          className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground opacity-50 cursor-not-allowed"
        >
          {label} ✦
        </button>
        {showTooltip && (
          <div className="absolute bottom-full left-0 mb-2 w-48 rounded-lg border border-border bg-card p-3 shadow-lg z-10">
            <p className="text-xs font-semibold text-foreground mb-1">{feature} è Pro</p>
            <a href="/pricing" className="text-xs text-primary hover:underline">Vedi i piani →</a>
          </div>
        )}
      </div>
    )
  }

  return (
    <button
      onClick={onAction}
      className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:border-primary hover:text-primary motion-reduce:transition-none"
    >
      {label}
    </button>
  )
}

const LANG_LABEL: Record<string, string> = {
  it: 'Italiano', en: 'English', fr: 'Français', es: 'Español', de: 'Deutsch',
}

const NOTES_KEY = 'sonabrief_recording_notes'
const IS_MAC = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC')

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

const fadeUp = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -4 },
  transition: { duration: 0.18, ease: [0.4, 0, 0.2, 1] as const },
}

// ─── Waveform ────────────────────────────────────────────────────────────────

function Waveform({ stream, frozen }: { stream: MediaStream | null; frozen: boolean }) {
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
    const BAR_COUNT = 20
    const GAP = 3

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
      width={200}
      height={40}
      className="opacity-80"
    />
  )
}

// ─── Types ────────────────────────────────────────────────────────────────────

type AudioSource = 'microphone' | 'tab' | 'both'

interface SourceOption {
  id: AudioSource
  label: string
  subtitle: string
  icon: LucideIcon
}

const SOURCE_OPTIONS: SourceOption[] = [
  {
    id: 'microphone',
    label: 'Microfono',
    subtitle: 'Solo la tua voce, ideale per meeting in presenza',
    icon: Mic,
  },
  {
    id: 'both',
    label: 'Videochiamata',
    subtitle: 'Tua voce + audio della scheda, ideale per call online',
    icon: Video,
  },
  {
    id: 'tab',
    label: 'Solo scheda',
    subtitle: "Solo l'audio in riproduzione, ideale per webinar o presentazioni",
    icon: Monitor,
  },
]

interface ModeOption {
  id: 'standard' | 'local'
  label: string
  desc: string
}

const MODE_OPTIONS: ModeOption[] = [
  { id: 'standard', label: 'Standard', desc: 'Trascrizione locale, sintesi tramite AI' },
  { id: 'local', label: 'Solo locale', desc: 'Tutto sul tuo computer, nessun dato inviato' },
]

// ─── Source selector button ────────────────────────────────────────────────────

function SourceButton({
  option,
  active,
  disabled,
  onClick,
}: {
  option: SourceOption
  active: boolean
  disabled: boolean
  onClick: () => void
}) {
  const Icon = option.icon
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-1 flex-col gap-1.5 rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? 'border-primary bg-primary/10'
          : 'border-border bg-card hover:bg-muted'
      }`}
    >
      <div className={`flex items-center gap-1.5 ${active ? 'text-primary' : 'text-foreground'}`}>
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="text-xs font-semibold">{option.label}</span>
      </div>
      <p className={`text-[10px] leading-snug ${active ? 'text-primary/70' : 'text-muted-foreground'}`}>
        {option.subtitle}
      </p>
    </button>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function RecordingPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { state, duration, error, paused, start, stop, pause, resume, audioData, reset, stream, chunkSession } = useAudioRecorder(() => {
    setTriggerPiP(true)
  })
  const [_partialTranscript, setPartialTranscript] = useState('')
  const [whisperState, setWhisperState] = useState<'loading' | 'ready' | 'transcribing' | 'done' | 'error'>('loading')
  const [whisperProgress, setWhisperProgress] = useState(0)
  const [whisperReady, setWhisperReady] = useState(false)
  const [showLoadingBanner, setShowLoadingBanner] = useState(false)
  const isModelCachedRef = useRef(false)
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [transcript, setTranscript] = useState('')
  const [segments, setSegments] = useState<WhisperSegment[]>([])
  const [synthesisState, setSynthesisState] = useState<'idle' | 'streaming' | 'done' | 'error'>('idle')
  const [synthesis, setSynthesis] = useState('')
  const [language, setLanguage] = useState<'it' | 'en' | 'fr' | 'es' | 'de'>('it')
  const [mode, setMode] = useState<'standard' | 'local'>('standard')
  const [source, setSource] = useState<AudioSource>(() => {
    const s = (location.state as { source?: AudioSource; prefillTitle?: string } | null)?.source
    return s && ['microphone', 'both', 'tab'].includes(s) ? s : 'microphone'
  })
  const [sessionTitle, setSessionTitle] = useState<string>(
    (location.state as { prefillTitle?: string } | null)?.prefillTitle ?? ''
  )
  const [quickNotes, setQuickNotes] = useState<string[]>([])
  const [showQuickNoteInput, setShowQuickNoteInput] = useState(false)
  const [quickNoteInput, setQuickNoteInput] = useState('')
  const [notes, setNotes] = useState(() => localStorage.getItem(NOTES_KEY) ?? '')
  const [transcriptOpen, setTranscriptOpen] = useState(false)
  const [copyDone, setCopyDone] = useState(false)
  const [templates, setTemplates] = useState<{ id: string; name: string; system_prompt: string }[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<string>('sys_generic_it_v2')
  const [templatePrompt, setTemplatePrompt] = useState<string>('')
  const [transcribeProgress, setTranscribeProgress] = useState(0)
  const [showTranscribeComplete, setShowTranscribeComplete] = useState(false)
  const [clientName, setClientName] = useState('')
  const [projectStream, setProjectStream] = useState('')
  const [meetingTags, setMeetingTags] = useState<string[]>([])
  const [clientSuggestion, setClientSuggestion] = useState<string | null>(null)
  const meetingIdRef = useRef('')
  const clientSuggestionLoadedRef = useRef(false)
  const notesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const quickNoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const quickNoteInputRef = useRef<HTMLInputElement>(null)
  const lastSessionIdRef = useRef<string | null>(null)
  const pipWindowRef = useRef<Window | null>(null)
  const openPiPRef = useRef<(() => void) | null>(null)
  const pipDurationRef = useRef(duration)
  const pipPausedRef = useRef(paused)
  const [triggerPiP, setTriggerPiP] = useState(false)
  const [pipActive, setPipActive] = useState(false)

  // ── Derived state
  const canStart = state === 'idle' && whisperState === 'ready'
  const isRecording = state === 'recording'
  const isProcessing = state === 'processing'
  const isTranscribing = state === 'done' && whisperState === 'transcribing'
  const isDone = state === 'done' && whisperState === 'done'
  const showNotesArea = isRecording || isProcessing || isTranscribing || isDone
  const shortcutLabel = IS_MAC ? '⌘E' : 'Ctrl+E'

  const { reset: resetChunked } = useChunkedTranscription({
    session: chunkSession,
    sessionId: chunkSession?.sessionId ?? null,
    language,
    isRecording,
    onPartialTranscript: setPartialTranscript,
  })

  // ── Export data builder
  function buildExportData() {
    const now = Date.now()
    const date = new Date(now).toLocaleString('it-IT', {
      day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
    return {
      title: `Meeting — ${date}`,
      date,
      duration: duration > 0 ? `${Math.ceil(duration / 60)} min` : '—',
      lang: LANG_LABEL[language] ?? language,
      content: synthesis,
    }
  }

  // ── Combine notes for synthesis
  function buildNotesForSynthesis(): string | undefined {
    const parts: string[] = []
    const textarea = localStorage.getItem(NOTES_KEY)?.trim()
    if (textarea) parts.push(textarea)
    if (quickNotes.length > 0) {
      parts.push(`Punti che l'utente vuole evidenziare: ${quickNotes.join(', ')}`)
    }
    return parts.length > 0 ? parts.join('\n\n') : undefined
  }

  // ── Notes textarea autosave
  function handleNotesChange(val: string) {
    setNotes(val)
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current)
    notesTimerRef.current = setTimeout(() => {
      localStorage.setItem(NOTES_KEY, val)
    }, 800)
  }

  useEffect(() => () => {
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current)
    if (quickNoteTimerRef.current) clearTimeout(quickNoteTimerRef.current)
  }, [])

  // ── Focus quick note input when shown
  useEffect(() => {
    if (showQuickNoteInput) {
      quickNoteInputRef.current?.focus()
    }
  }, [showQuickNoteInput])

  // ── Quick note commit
  function commitQuickNote() {
    if (quickNoteTimerRef.current) clearTimeout(quickNoteTimerRef.current)
    const val = quickNoteInput.trim()
    if (val) setQuickNotes(prev => [...prev, val])
    setQuickNoteInput('')
    setShowQuickNoteInput(false)
  }

  function handleQuickNoteChange(val: string) {
    const trimmed = val.slice(0, 100)
    setQuickNoteInput(trimmed)
    if (quickNoteTimerRef.current) clearTimeout(quickNoteTimerRef.current)
    if (trimmed.trim()) {
      quickNoteTimerRef.current = setTimeout(() => {
        setQuickNotes(prev => [...prev, trimmed.trim()])
        setQuickNoteInput('')
        setShowQuickNoteInput(false)
      }, 8000)
    }
  }

  // ── Whisper init
  useEffect(() => {
    whisper.init()
    embeddingsService.init()

    const alreadyDownloaded = localStorage.getItem('sonabrief_whisper_ready') === 'true'
    if (!alreadyDownloaded) {
      bannerTimerRef.current = setTimeout(() => {
        if (!isModelCachedRef.current) {
          setShowLoadingBanner(true)
        }
      }, 600)
    }

    const unsub = whisper.on((event) => {
      if (event.type === 'loading') setWhisperProgress(event.progress)
      if (event.type === 'ready') {
        isModelCachedRef.current = true
        const isFirstDownload = localStorage.getItem('sonabrief_whisper_ready') !== 'true'
        localStorage.setItem('sonabrief_whisper_ready', 'true')
        if (bannerTimerRef.current) {
          clearTimeout(bannerTimerRef.current)
          bannerTimerRef.current = null
        }
        setShowLoadingBanner(false)
        setWhisperState('ready')
        if (isFirstDownload) {
          setWhisperReady(true)
          setTimeout(() => setWhisperReady(false), 2000)
        }
      }
      if (event.type === 'transcribing') setWhisperState('transcribing')
      if (event.type === 'result') {
        setTranscript(event.text)
        setSegments((event.segments as WhisperSegment[]) ?? [])
        setWhisperState('done')
      }
      if (event.type === 'error') setWhisperState('error')
    })

    whisper.loadAuto()

    return () => {
      unsub()
      whisper.destroy()
      if (bannerTimerRef.current) {
        clearTimeout(bannerTimerRef.current)
        bannerTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    fetch(`${API_URL}/v1/templates?language=${language}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then((data: { id: string; name: string; system_prompt: string }[]) => {
        if (Array.isArray(data) && data.length) {
          setTemplates(data)
          const genericId = `sys_generic_${language}_v${language === 'it' ? '2' : '1'}`
          const defaultTpl = data.find(t => t.id === genericId) ?? data[0]
          if (defaultTpl) {
            setSelectedTemplate(defaultTpl.id)
            setTemplatePrompt(defaultTpl.system_prompt)
          }
        }
      })
      .catch(() => {})
  }, [language])

  useEffect(() => {
    const tpl = templates.find(t => t.id === selectedTemplate)
    if (tpl) setTemplatePrompt(tpl.system_prompt)
  }, [selectedTemplate, templates])

  useEffect(() => {
    if (audioData && whisperState === 'ready') whisper.transcribe(audioData, language)
  }, [audioData, whisperState])

  // ── DB save
  useEffect(() => {
    if (synthesisState !== 'done') return
    const id = meetingIdRef.current
    if (!id) return
    const now = Date.now()
    const autoTitle = new Date(now).toLocaleString(language, {
      day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
    const title = sessionTitle.trim() || autoTitle
    db.transaction('rw', [db.meetings, db.transcripts, db.notes], async () => {
      await db.meetings.add({
        id, title,
        startedAt: now - duration * 1000,
        endedAt: now,
        durationSeconds: duration,
        mode: 'standard',
        lang: language,
        ...(clientName.trim() && { clientName: clientName.trim() }),
        ...(projectStream.trim() && { projectStream: projectStream.trim() }),
        ...(meetingTags.length > 0 && { tags: meetingTags }),
        hasSynthesis: true,
        createdAt: now,
        updatedAt: now,
      })
      await db.transcripts.add({
        id: crypto.randomUUID(), meetingId: id,
        text: transcript, segments: JSON.stringify(segments), createdAt: now,
      })
      await db.notes.add({
        id: crypto.randomUUID(), meetingId: id, content: synthesis,
        generatedAt: now, createdAt: now, updatedAt: now,
      })
    }).then(() => {
      if (localStorage.getItem('sonabrief_sync_enabled') === 'true' && isUnlocked()) {
        syncMeetingNow(id)
      }
      saveActionItemsFromNote(id, synthesis)
      saveEmbeddingForMeeting(id, synthesis)
      if (chunkSession) {
        db.recording_sessions.delete(chunkSession.sessionId).catch(() => {})
      }
    }).catch(err => console.error('[db] salvataggio meeting fallito:', err))
  }, [synthesisState])

  // ── Wake Lock: impedisce blocco schermo durante registrazione
  useEffect(() => {
    if (!('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    if (isRecording && !paused) {
      navigator.wakeLock.request('screen').then(l => { lock = l }).catch(() => {})
    }
    return () => { lock?.release().catch(() => {}) }
  }, [isRecording, paused])

  useEffect(() => {
    if (triggerPiP && (source === 'both' || source === 'tab')) {
      setTriggerPiP(false)
      openPiP()
    }
    if (triggerPiP) setTriggerPiP(false)
  }, [triggerPiP])

  useEffect(() => { pipDurationRef.current = duration }, [duration])
  useEffect(() => { pipPausedRef.current = paused }, [paused])

  // ── Quick note shortcut
  const triggerQuickNote = useCallback(() => {
    if (state !== 'recording') return
    setShowQuickNoteInput(true)
  }, [state])

  // ── Simulated transcription progress
  useEffect(() => {
    if (!isTranscribing) return
    setTranscribeProgress(0)
    const estimated = Math.max(2000, duration * 0.5 * 1000)
    const startTime = Date.now()
    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime
      const pct = Math.min(95, Math.round((elapsed / estimated) * 95))
      setTranscribeProgress(pct)
      if (pct >= 95) clearInterval(timer)
    }, 200)
    return () => clearInterval(timer)
  }, [isTranscribing])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'e' && (IS_MAC ? e.metaKey : e.ctrlKey)) {
        e.preventDefault()
        triggerQuickNote()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [triggerQuickNote])

  // Tieni traccia dell'ultimo sessionId attivo
  useEffect(() => {
    if (chunkSession?.sessionId) {
      lastSessionIdRef.current = chunkSession.sessionId
    }
  }, [chunkSession])

  useEffect(() => {
    if (whisperState !== 'done') return
    setTranscribeProgress(100)
    setShowTranscribeComplete(true)
    const t = setTimeout(() => setShowTranscribeComplete(false), 1500)

    // Usa l'ultimo sessionId noto (chunkSession potrebbe essere già null)
    const sessionIdToDelete = lastSessionIdRef.current
    if (sessionIdToDelete) {
      db.recording_sessions.delete(sessionIdToDelete).catch(() => {})
      lastSessionIdRef.current = null
    }

    return () => clearTimeout(t)
  }, [whisperState])

  // ── Client suggestion from most-frequent past meetings
  useEffect(() => {
    if (state !== 'processing' || clientSuggestionLoadedRef.current) return
    clientSuggestionLoadedRef.current = true
    db.meetings
      .filter(m => !!m.clientName)
      .toArray()
      .then(meetings => {
        if (!meetings.length) return
        const counts = new Map<string, number>()
        meetings.forEach(m => {
          if (m.clientName) counts.set(m.clientName, (counts.get(m.clientName) ?? 0) + 1)
        })
        const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
        if (top) setClientSuggestion(top[0])
      })
      .catch(() => {})
  }, [state])

  // ── Save transcript without synthesis
  // ── Synthesis
  async function generateSynthesis() {
    meetingIdRef.current = crypto.randomUUID()
    setSynthesisState('streaming')
    setSynthesis('')

    const combinedNotes = buildNotesForSynthesis()

    if (mode === 'local') {
      await synthesizeWithOllama(
        transcript,
        language,
        combinedNotes,
        templatePrompt,
        (text) => setSynthesis(prev => prev + text),
        () => setSynthesisState('done'),
        () => setSynthesisState('error'),
      )
      return
    }

    try {
      const response = await fetch(`${API_URL}/v1/synthesize`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript,
          meeting_id: meetingIdRef.current,
          language,
          mode,
          system_prompt: templatePrompt,
          template_id: selectedTemplate,
          audio_minutes: Math.ceil(duration / 60),
          notes: combinedNotes,
        }),
      })
      if (!response.ok || !response.body) { setSynthesisState('error'); return }
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()!
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))
            if (event.type === 'chunk') setSynthesis(prev => prev + event.text)
            if (event.type === 'done') setSynthesisState('done')
            if (event.type === 'error') setSynthesisState('error')
          } catch { /* ignora righe SSE malformate */ }
        }
      }
    } catch { setSynthesisState('error') }
  }

  async function saveTranscriptOnly() {
    if (!transcript) return
    const id = meetingIdRef.current || crypto.randomUUID()
    meetingIdRef.current = id
    const now = Date.now()
    const autoTitle = new Date(now).toLocaleString(language, {
      day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
    const title = sessionTitle.trim() || autoTitle
    try {
      await db.transaction('rw', [db.meetings, db.transcripts], async () => {
        await db.meetings.add({
          id, title,
          startedAt: now - duration * 1000,
          endedAt: now,
          durationSeconds: duration,
          mode: 'standard',
          lang: language,
          hasSynthesis: false,
          ...(clientName.trim() && { clientName: clientName.trim() }),
          ...(projectStream.trim() && { projectStream: projectStream.trim() }),
          ...(meetingTags.length > 0 && { tags: meetingTags }),
          createdAt: now,
          updatedAt: now,
        })
        await db.transcripts.add({
          id: crypto.randomUUID(), meetingId: id,
          text: transcript, segments: JSON.stringify(segments), createdAt: now,
        })
      })
      if (localStorage.getItem('sonabrief_sync_enabled') === 'true' && isUnlocked()) {
        syncMeetingNow(id)
      }
      saveEmbeddingForMeeting(id, transcript)
      if (chunkSession) {
        db.recording_sessions.delete(chunkSession.sessionId).catch(() => {})
      }
      navigate('/archive')
    } catch (err) {
      console.error('[db] saveTranscriptOnly fallito:', err)
    }
  }

  async function openPiP() {
    if (!('documentPictureInPicture' in window)) {
      alert('Il tuo browser non supporta questa funzione. Usa Chrome 116+.')
      return
    }
    try {
      const pipWin = await (window as any).documentPictureInPicture.requestWindow({
        width: 400,
        height: 500,
      })
      pipWindowRef.current = pipWin
      setPipActive(true)

      // Copia i fogli di stile nella finestra PiP
      ;[...document.styleSheets].forEach(sheet => {
        try {
          if (sheet.href) {
            const link = pipWin.document.createElement('link')
            link.rel = 'stylesheet'
            link.href = sheet.href
            pipWin.document.head.appendChild(link)
          } else {
            const style = pipWin.document.createElement('style')
            const rules = [...(sheet.cssRules ?? [])].map(r => r.cssText).join('\n')
            style.textContent = rules
            pipWin.document.head.appendChild(style)
          }
        } catch { /* cross-origin sheet, skip */ }
      })

      // Copia variabili CSS dal root
      const rootStyle = pipWin.document.createElement('style')
      rootStyle.textContent = document.documentElement.getAttribute('style') ?? ''
      pipWin.document.head.appendChild(rootStyle)

      // Copia classe dark se presente
      if (document.documentElement.classList.contains('dark')) {
        pipWin.document.documentElement.classList.add('dark')
      }

      pipWin.document.body.style.cssText = 'margin:0;padding:0;background:var(--background,#fff);'

      // Mount React nell'iframe PiP
      const container = pipWin.document.createElement('div')
      container.id = 'pip-root'
      pipWin.document.body.appendChild(container)

      // Render del componente PiP
      const { createRoot } = await import('react-dom/client')
      const { PiPRecorder } = await import('../components/PiPRecorder')
      const React = await import('react')

      const root = createRoot(container)
      const render = (d: number, p: boolean) => {
        root.render(
          React.createElement(PiPRecorder, {
            duration: d,
            paused: p,
            initialNotes: notes,
            onPause: () => { pause(); render(duration, true) },
            onResume: () => { resume(); render(duration, false) },
            onStop: () => { stop(); pipWin.close() },
            onNotesChange: (val: string) => {
              handleNotesChange(val)
            },
          })
        )
      }
      render(duration, paused)

      // Aggiorna ogni secondo
      const interval = setInterval(() => {
        if (pipWin.closed) { clearInterval(interval); setPipActive(false); return }
        render(pipDurationRef.current, pipPausedRef.current)
      }, 1000)

      pipWin.addEventListener('pagehide', () => {
        clearInterval(interval)
        setPipActive(false)
        root.unmount()
      })
    } catch (err) {
      console.error('[PiP] errore:', err)
    }
  }
  openPiPRef.current = openPiP

  function handleNewRecording() {
    const sessionIdToDelete = chunkSession?.sessionId ?? null
    reset()
    resetChunked()
    if (sessionIdToDelete) {
      db.recording_sessions.delete(sessionIdToDelete).catch(() => {})
    }
    setPartialTranscript('')
    setTranscript('')
    setSegments([])
    setSynthesis('')
    setSynthesisState('idle')
    setQuickNotes([])
    setShowQuickNoteInput(false)
    setQuickNoteInput('')
    setNotes('')
    setTranscriptOpen(false)
    setCopyDone(false)
    meetingIdRef.current = ''
    localStorage.removeItem(NOTES_KEY)
    setSelectedTemplate(`sys_generic_${language}_v${language === 'it' ? '2' : '1'}`)
    setWhisperState('ready')
    setTranscribeProgress(0)
    setShowTranscribeComplete(false)
    setClientName('')
    setProjectStream('')
    setMeetingTags([])
    setClientSuggestion(null)
    clientSuggestionLoadedRef.current = false
  }

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)

  if (isMobile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-8 text-center">
        <div className="text-4xl mb-4">🎙️</div>
        <h2 className="font-heading text-xl font-semibold text-foreground mb-2">
          Registrazione non ancora disponibile su mobile
        </h2>
        <p className="text-muted-foreground text-sm max-w-sm">
          Stiamo lavorando all'app mobile. Per ora la registrazione
          richiede un computer. Da qui puoi consultare l'archivio,
          gestire le azioni e cercare nei tuoi meeting.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <h1 className="sr-only">Nuovo meeting — Sonabrief</h1>
      <AppNav />

      <main className="mx-auto max-w-4xl px-6 py-10">
        {state === 'idle' && <RecoveryBanner />}
        <div className="lg:grid lg:grid-cols-[3fr_2fr] lg:gap-10">

          {/* ── Left column: recording workspace ──────────────────── */}
          <div className="space-y-7">

            <h2 className="font-heading text-2xl font-bold text-foreground tracking-[-0.015em]">
              Nuovo meeting
            </h2>

            {/* Banner download modello */}
            <AnimatePresence mode="wait">
              {showLoadingBanner && (
                <motion.div
                  key="model-loading"
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                  className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 space-y-2"
                >
                  <div className="flex items-center gap-2.5">
                    <svg
                      className="h-4 w-4 shrink-0 animate-spin text-primary motion-reduce:animate-none"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                    </svg>
                    <div>
                      <p className="text-sm font-semibold text-primary">Sonabrief AI si sta preparando</p>
                      <p className="text-xs text-primary/70">Solo al primo avvio — ci vuole qualche minuto, poi è sempre immediato</p>
                    </div>
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-primary/20">
                    <div className="h-full w-1/3 rounded-full bg-primary animate-pulse" />
                  </div>
                </motion.div>
              )}
              {whisperReady && (
                <motion.div
                  key="model-ready"
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                  className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 flex items-center gap-2.5"
                >
                  <svg className="h-4 w-4 shrink-0 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <p className="text-sm font-semibold text-green-700 dark:text-green-400">Pronto. Puoi avviare la registrazione.</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Source selector — visible when idle */}
            <AnimatePresence mode="wait">
              {state === 'idle' && (
                <motion.section key="source" {...fadeUp} aria-labelledby="source-heading">
                  <p
                    id="source-heading"
                    className="mb-2.5 text-xs font-medium uppercase tracking-widest text-muted-foreground"
                  >
                    Sorgente audio
                  </p>
                  <div className="flex gap-2">
                    {SOURCE_OPTIONS.map(opt => (
                      <SourceButton
                        key={opt.id}
                        option={opt}
                        active={source === opt.id}
                        disabled={!canStart}
                        onClick={() => setSource(opt.id)}
                      />
                    ))}
                  </div>
                </motion.section>
              )}
            </AnimatePresence>

            {/* Language + mode — visible when idle, before start */}
            <AnimatePresence mode="wait">
              {state === 'idle' && (
              <motion.div key="lang-mode" {...fadeUp} className="space-y-4">
                <div>
                  <label
                    htmlFor="language-select"
                    className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-muted-foreground"
                  >
                    Lingua del meeting
                  </label>
                  <select
                    id="language-select"
                    value={language}
                    onChange={e => setLanguage(e.target.value as typeof language)}
                    disabled={!canStart}
                    className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <option value="it">Italiano</option>
                    <option value="en">English</option>
                    <option value="fr">Français</option>
                    <option value="es">Español</option>
                    <option value="de">Deutsch</option>
                  </select>
                </div>

                <fieldset>
                  <legend className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                    Modalità sintesi
                  </legend>
                  <div className="flex gap-2">
                    {MODE_OPTIONS.map(m => (
                      <button
                        key={m.id}
                        onClick={() => setMode(m.id)}
                        disabled={!canStart}
                        className={`flex flex-1 flex-col gap-0.5 rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-40 ${
                          mode === m.id
                            ? 'border-primary bg-primary/10'
                            : 'border-border bg-card hover:bg-muted'
                        }`}
                      >
                        <span className={`text-xs font-semibold ${mode === m.id ? 'text-primary' : 'text-foreground'}`}>
                          {m.label}
                        </span>
                        <span className={`text-[10px] leading-snug ${mode === m.id ? 'text-primary/70' : 'text-muted-foreground'}`}>
                          {m.desc}
                        </span>
                      </button>
                    ))}
                  </div>
                </fieldset>
              </motion.div>
              )}
            </AnimatePresence>

            {/* Session title prefill — visible when idle and prefillTitle passed */}
            {state === 'idle' && sessionTitle && (
              <div>
                <label
                  htmlFor="session-title"
                  className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-muted-foreground"
                >
                  Titolo sessione
                </label>
                <input
                  id="session-title"
                  type="text"
                  value={sessionTitle}
                  onChange={e => setSessionTitle(e.target.value)}
                  className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            )}

            {/* Start button — idle + ready */}
            {canStart && (
              <Button
                onClick={() => { localStorage.removeItem(NOTES_KEY); setNotes(''); start(source) }}
                className="w-full rounded-md hover:bg-(--primary-hover)"
              >
                Avvia registrazione
              </Button>
            )}

            {/* Recording: timer + waveform + pause/stop */}
            <AnimatePresence mode="wait">
              {isRecording && (
              <motion.div key="recording" {...fadeUp} className="space-y-5">
                <div className="flex items-center gap-4">
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full bg-destructive ${paused ? 'opacity-40' : 'animate-pulse motion-reduce:animate-none'}`}
                    aria-hidden="true"
                  />
                  <span className="font-mono text-4xl tabular-nums text-foreground">
                    {paused ? (
                      <span className="text-muted-foreground">
                        {formatDuration(duration)} <span className="text-2xl font-sans font-normal">— in pausa</span>
                      </span>
                    ) : (
                      formatDuration(duration)
                    )}
                  </span>
                </div>

                <Waveform stream={stream ?? null} frozen={paused} />

                <p className="text-sm text-muted-foreground">
                  {paused ? 'Registrazione in pausa' : 'Registrazione in corso'}
                </p>

                <div className="flex gap-3">
                  <Button
                    variant="destructive"
                    onClick={stop}
                    className="rounded-md"
                  >
                    Ferma registrazione
                  </Button>
                  <Button
                    variant="outline"
                    onClick={paused ? resume : pause}
                    className="rounded-md"
                  >
                    {paused ? 'Riprendi' : 'Pausa'}
                  </Button>
                </div>
                <Button
                  variant="outline"
                  onClick={pipActive ? () => { pipWindowRef.current?.close(); setPipActive(false) } : openPiP}
                  className="rounded-md text-xs"
                  title="Apre un pannello che rimane sopra la tua videochiamata"
                >
                  {pipActive ? 'Chiudi pannello' : '⧉ Sempre visibile'}
                </Button>
              </motion.div>
              )}
            </AnimatePresence>

            {/* Processing: audio conversion */}
            {isProcessing && (
              <p className="text-sm text-muted-foreground">Conversione audio...</p>
            )}

            {/* Transcribing: simulated progress bar */}
            <AnimatePresence mode="wait">
              {isTranscribing && (
              <motion.div key="transcribing" {...fadeUp} className="space-y-2">
                <p className="text-sm font-medium text-foreground">
                  Trascrizione in corso... {transcribeProgress}%
                </p>
                <div
                  role="progressbar"
                  aria-valuenow={transcribeProgress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Trascrizione: ${transcribeProgress}%`}
                  className="h-1.5 w-full overflow-hidden rounded-full bg-border"
                >
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out motion-reduce:transition-none"
                    style={{ width: `${transcribeProgress}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">Potrebbe richiedere qualche minuto</p>
              </motion.div>
              )}
            </AnimatePresence>

            {/* Transcription complete flash */}
            {isDone && showTranscribeComplete && (
              <p className="text-sm font-medium text-primary">Trascrizione completata</p>
            )}

            {/* Done: transcript + synthesis flow */}
            <AnimatePresence mode="wait">
              {isDone && !showTranscribeComplete && (
              <motion.div key="done" {...fadeUp} className="space-y-5">

                {/* Collapsible transcript */}
                {transcript && (
                  <div className="rounded-lg border border-border bg-card">
                    <button
                      onClick={() => setTranscriptOpen(o => !o)}
                      className="flex w-full items-center justify-between px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      aria-expanded={transcriptOpen}
                      aria-controls="transcript-content"
                    >
                      <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                        Trascrizione
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {transcriptOpen ? 'Chiudi' : 'Mostra'}
                      </span>
                    </button>
                    {transcriptOpen && (
                      <div
                        id="transcript-content"
                        className="border-t border-border px-4 pb-4 pt-3"
                      >
                        <ProGate feature="Speaker labeling">
                          <TranscriptViewer segments={segments} rawText={transcript} />
                        </ProGate>
                      </div>
                    )}
                  </div>
                )}

                {/* Template selector + client/project + generate */}
                {synthesisState === 'idle' && (
                  <div className="space-y-3">
                    {templates.length > 0 && (
                      <div>
                        <label
                          htmlFor="template-select"
                          className="mb-1.5 block text-xs font-medium text-muted-foreground"
                        >
                          Tipo di meeting
                        </label>
                        <select
                          id="template-select"
                          value={selectedTemplate}
                          onChange={e => setSelectedTemplate(e.target.value)}
                          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                        >
                          {templates.map(t => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Client / project */}
                    <div className="space-y-2.5">
                      <div>
                        <label
                          htmlFor="client-name"
                          className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-muted-foreground"
                        >
                          Cliente <span className="normal-case tracking-normal text-muted-foreground/60">(opzionale)</span>
                        </label>
                        {clientSuggestion && !clientName && (
                          <button
                            onClick={() => setClientName(clientSuggestion)}
                            className="mb-1.5 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20 motion-reduce:transition-none"
                          >
                            Usa: {clientSuggestion}
                          </button>
                        )}
                        <input
                          id="client-name"
                          type="text"
                          value={clientName}
                          onChange={e => setClientName(e.target.value)}
                          placeholder="es. Acme Srl"
                          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="project-stream"
                          className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-muted-foreground"
                        >
                          Progetto / Stream <span className="normal-case tracking-normal text-muted-foreground/60">(opzionale)</span>
                        </label>
                        <input
                          id="project-stream"
                          type="text"
                          value={projectStream}
                          onChange={e => setProjectStream(e.target.value)}
                          placeholder="es. Lancio Q3"
                          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-muted-foreground">
                          Tag <span className="normal-case tracking-normal text-muted-foreground/60">(opzionale)</span>
                        </label>
                        <ProGate feature="Tag meeting">
                          <TagInput value={meetingTags} onChange={setMeetingTags} />
                        </ProGate>
                      </div>
                    </div>

                    <Button
                      onClick={generateSynthesis}
                      className="w-full rounded-md hover:bg-(--primary-hover)"
                    >
                      Genera sintesi
                    </Button>
                    <Button
                      variant="outline"
                      onClick={saveTranscriptOnly}
                      className="w-full rounded-md"
                    >
                      Salva solo trascrizione
                    </Button>
                  </div>
                )}

                {/* Synthesis editor */}
                {(synthesisState === 'streaming' || synthesisState === 'done') && (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Sintesi
                    </p>
                    <SynthesisEditor
                      content={synthesis}
                      isStreaming={synthesisState === 'streaming'}
                    />
                    {synthesisState === 'streaming' && (
                      <span className="block animate-pulse text-sm text-muted-foreground motion-reduce:animate-none">
                        &#9609;
                      </span>
                    )}
                    {synthesisState === 'done' && (
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => exportMarkdown(buildExportData())}
                          className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:border-primary hover:text-primary motion-reduce:transition-none"
                        >
                          Markdown
                        </button>
                        <ProGatedButton
                          label="PDF"
                          feature="Export PDF"
                          onAction={() => exportPDF(buildExportData())}
                        />
                        <ProGatedButton
                          label="Word"
                          feature="Export Word"
                          onAction={() => exportWord(buildExportData())}
                        />
                        <ProGatedButton
                          label="Email"
                          feature="Export Email"
                          onAction={() => exportEmail(buildExportData())}
                        />
                        <button
                          onClick={async () => {
                            await copyFormatted(buildExportData())
                            setCopyDone(true)
                            setTimeout(() => setCopyDone(false), 2000)
                          }}
                          className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:border-primary hover:text-primary motion-reduce:transition-none"
                        >
                          {copyDone ? 'Copiato' : 'Copia testo'}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {synthesisState === 'error' && (
                  <p className="text-sm text-destructive">Errore durante la sintesi. Riprova.</p>
                )}

                {/* Post-recording navigation */}
                <div className="flex gap-3 pt-2">
                  <Button variant="outline" onClick={handleNewRecording} className="rounded-md">
                    Nuova registrazione
                  </Button>
                  <Button variant="outline" onClick={() => navigate('/archive')} className="rounded-md">
                    Archivio
                  </Button>
                </div>
              </motion.div>
              )}
            </AnimatePresence>

            {/* Error: recorder failed */}
            {state === 'error' && (
              <div className="space-y-3">
                <p className="text-sm text-destructive">Errore: {error}</p>
                <Button variant="outline" onClick={handleNewRecording} className="rounded-md">
                  Riprova
                </Button>
              </div>
            )}

          </div>

          {/* ── Right sidebar ─────────────────────────────────────── */}
          <aside
            className="mt-8 space-y-6 lg:mt-0"
            aria-label="Contesto e note"
          >

            {/* Briefing context — always visible */}
            <ProGate feature="Briefing pre-meeting">
              <MeetingBriefing />
            </ProGate>


            {/* Quick notes — during recording */}
            {isRecording && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                    Note rapide
                  </p>
                  <button
                    onClick={triggerQuickNote}
                    className="flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    aria-label={`Aggiungi nota rapida (${shortcutLabel})`}
                  >
                    <span className="text-xs text-muted-foreground">Aggiungi</span>
                    <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      {shortcutLabel}
                    </span>
                  </button>
                </div>

                {showQuickNoteInput && (
                  <div className="mb-3">
                    <input
                      ref={quickNoteInputRef}
                      type="text"
                      value={quickNoteInput}
                      onChange={e => handleQuickNoteChange(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); commitQuickNote() }
                        if (e.key === 'Escape') { setShowQuickNoteInput(false); setQuickNoteInput('') }
                      }}
                      maxLength={100}
                      placeholder="Nota rapida..."
                      className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Invio per salvare · Esc per annullare · autosalvataggio in 8s
                    </p>
                  </div>
                )}

                {quickNotes.length === 0 && !showQuickNoteInput && (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Premi ⌘E (Mac) o Ctrl+E (Windows) per segnare un tema chiave in questo momento — verrà evidenziato come punto importante nella sintesi finale.
                  </p>
                )}

                {quickNotes.length > 0 && (
                  <ul className="space-y-1.5">
                    {quickNotes.map((note, i) => (
                      <motion.li
                        key={i}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.16, delay: i * 0.04 }}
                        className="flex items-start gap-2"
                      >
                        <span
                          className="mt-1.25 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                          aria-hidden="true"
                        />
                        <span className="text-xs text-foreground">{note}</span>
                      </motion.li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Notes textarea — during and after recording */}
            {showNotesArea && (
              <div>
                <label
                  htmlFor="recording-notes"
                  className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-muted-foreground"
                >
                  Note
                </label>
                <textarea
                  id="recording-notes"
                  value={notes}
                  onChange={e => handleNotesChange(e.target.value)}
                  placeholder="Segna qui i tuoi appunti — verranno integrati nella sintesi insieme alle note rapide"
                  className="w-full resize-none rounded-md border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                  style={{ minHeight: '160px' }}
                />
                <p className="mt-1 text-xs text-muted-foreground">Autosalvataggio attivo</p>
              </div>
            )}

          </aside>
        </div>
      </main>
    </div>
  )
}
