import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Mic, Monitor, Video, Lock, Zap, Clock, CheckCircle2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAudioRecorder } from '../hooks/useAudioRecorder'
import { useCloudTranscription } from '../hooks/useCloudTranscription'
import { CloudQuotaWidget } from '../components/CloudQuotaWidget'
import { fetchCloudQuota } from '../lib/transcribeCloud'
import { estimateTranscriptionMinutes } from '../lib/transcribeUtils'
import { getHardwareTier } from '../lib/whisperModel'
import { requestNotificationPermission, notifyTranscriptionDone } from '../lib/notifications'
import { toast } from 'sonner'
import { whisper } from '../lib/whisper'
import { Button } from '../components/ui/button'
import { API_URL } from '../config'
import { SynthesisEditor } from '../components/SynthesisEditor'
import { TranscriptViewer } from '../components/TranscriptViewer'
import type { WhisperSegment } from '../components/TranscriptViewer'
import { db } from '../lib/db'
import { synthesizeWithOllama } from '../lib/ollama'
import { OllamaSetupFlow } from '../components/local-mode'
import { HardwareSuggestionModal } from '../components/HardwareSuggestionModal'
import { syncMeetingNow } from '../lib/sync'
import { saveActionItemsFromNote } from '../lib/actionItems'
import { saveEmbeddingForMeeting } from '../lib/semanticSearch'
import { embeddingsService } from '../lib/embeddings'
import { isUnlocked } from '../lib/keystore'
import { MeetingBriefing } from '../components/MeetingBriefing'
import { AppNav } from '../components/AppNav'
import { RecoveryBanner } from '../components/RecoveryBanner'
import { exportMarkdown, exportPDF, exportWord, exportEmail, copyFormatted } from '../lib/export'
import { useTier } from '../hooks/useTier'
import { TagInput } from '../components/TagInput'
import { formatMeetingTitle } from '../lib/locale'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n'

function ProGatedButton({ label, feature, onAction }: {
  label: string
  feature: string
  onAction: () => void
}) {
  const { isFree } = useTier()
  const { t } = useTranslation()
  const [showTooltip, setShowTooltip] = useState(false)

  if (isFree) {
    return (
      <div className="relative">
        <button
          onClick={() => setShowTooltip(prev => !prev)}
          className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground opacity-50 cursor-not-allowed"
        >
          {label} ✦
        </button>
        {showTooltip && (
          <div className="absolute bottom-full left-0 mb-2 w-48 rounded-lg border border-border bg-card p-3 shadow-lg z-10">
            <p className="text-xs font-semibold text-foreground mb-1">{t('recording.pro_feature_label', { feature })}</p>
            <a href="/pricing" className="text-xs text-primary hover:underline">{t('recording.see_plans')}</a>
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

    let lastFrame = 0
    const TARGET_FPS = 15
    const FRAME_INTERVAL = 1000 / TARGET_FPS

    function draw(timestamp: number) {
      if (timestamp - lastFrame >= FRAME_INTERVAL) {
        lastFrame = timestamp
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
      }
      rafRef.current = requestAnimationFrame(draw)
    }
    rafRef.current = requestAnimationFrame(draw)

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

type RecordingMode = 'standard' | 'local' | 'cloud'

interface ModeOption {
  id: RecordingMode
  label: string
  desc: string
  icon?: LucideIcon
}

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
  const { isFree, tier } = useTier()
  const { t } = useTranslation()
  const navigate = useNavigate()

  const SOURCE_OPTIONS: SourceOption[] = [
    { id: 'microphone', label: t('recording.source_mic'), subtitle: t('recording.source_mic_desc'), icon: Mic },
    { id: 'both', label: t('recording.source_call'), subtitle: t('recording.source_call_desc'), icon: Video },
    { id: 'tab', label: t('recording.source_tab'), subtitle: t('recording.source_tab_desc'), icon: Monitor },
  ]

  const hwTier = useMemo(() => getHardwareTier(), [])
  const isSlowHardware = hwTier === 'slow' || hwTier === 'medium'
  const isProPlus = tier === 'pro' || tier === 'unlimited'

  const MODE_OPTIONS: ModeOption[] = [
    { id: 'standard', label: t('recording.mode_standard'), desc: t('recording.mode_standard_desc') },
    { id: 'local', label: t('recording.mode_local'), desc: t('recording.mode_local_desc') },
    { id: 'cloud', label: t('recording.mode_cloud'), desc: t('recording.mode_cloud_desc'), icon: Zap },
  ]

  const orderedModeOptions = useMemo(() => {
    if (isSlowHardware && isProPlus) {
      return (['cloud', 'standard', 'local'] as RecordingMode[]).map(id => MODE_OPTIONS.find(m => m.id === id)!)
    }
    return MODE_OPTIONS
  }, [isSlowHardware, isProPlus])
  const location = useLocation()
  const { state, duration, error, paused, start, stop, pause, resume, audioData, audioBlob, reset, stream, chunkSession } = useAudioRecorder(() => {
    setTriggerPiP(true)
  })
  const [_partialTranscript, setPartialTranscript] = useState('')
  const [whisperState, setWhisperState] = useState<'loading' | 'ready' | 'transcribing' | 'done' | 'error'>('loading')
  const [_whisperProgress, setWhisperProgress] = useState(0)
  const [whisperReady, setWhisperReady] = useState(false)
  const [showLoadingBanner, setShowLoadingBanner] = useState(false)
  const isModelCachedRef = useRef(false)
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [transcript, setTranscript] = useState('')
  const [segments, setSegments] = useState<WhisperSegment[]>([])
  const [synthesisState, setSynthesisState] = useState<'idle' | 'streaming' | 'done' | 'error'>('idle')
  const [synthesis, setSynthesis] = useState('')
  const [language, setLanguage] = useState<'it' | 'en' | 'fr' | 'es' | 'de'>(() => {
    const l = (location.state as { language?: string } | null)?.language
    return (l && ['it', 'en', 'fr', 'es', 'de'].includes(l) ? l : 'it') as 'it' | 'en' | 'fr' | 'es' | 'de'
  })
  const [mode, setMode] = useState<RecordingMode>('standard')
  const [cloudInlineQuota, setCloudInlineQuota] = useState<number | null>(null)
  const cloudTx = useCloudTranscription()
  const notificationPermissionRequestedRef = useRef(false)
  const backgroundWarningShownRef = useRef(false)
  const sessionTitleRef = useRef('')
  const hasTriggeredCloudRef = useRef(false)

  const handleStop = useCallback(() => {
    if (!notificationPermissionRequestedRef.current) {
      notificationPermissionRequestedRef.current = true
      requestNotificationPermission().catch(() => {})
    }
    backgroundWarningShownRef.current = false
    stop()
  }, [stop])

  async function handleRequestNotify() {
    const result = await requestNotificationPermission()
    if (result === 'granted') setNotifyGranted(true)
  }
  const [source, setSource] = useState<AudioSource>(() => {
    const s = (location.state as { source?: AudioSource; prefillTitle?: string } | null)?.source
    return s && ['microphone', 'both', 'tab'].includes(s) ? s : 'microphone'
  })
  const [sessionTitle, setSessionTitle] = useState<string>(
    (location.state as { prefillTitle?: string } | null)?.prefillTitle ?? ''
  )
  const prefillMeetingUrl = (location.state as { meetingUrl?: string | null } | null)?.meetingUrl ?? null
  const participants = (location.state as { participants?: string[] } | null)?.participants ?? []
  const [quickNotes, setQuickNotes] = useState<string[]>([])
  const [showQuickNoteInput, setShowQuickNoteInput] = useState(false)
  const [quickNoteInput, setQuickNoteInput] = useState('')
  const [notes, setNotes] = useState(() => localStorage.getItem(NOTES_KEY) ?? '')
  const [transcriptOpen, setTranscriptOpen] = useState(false)
  const [showTimestamps, setShowTimestamps] = useState(false)
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
  const [showOllamaModal, setShowOllamaModal] = useState(false)
  const pendingSynthesisRef = useRef(false)
  const [showMetadata, setShowMetadata] = useState(false)
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
  const [showTabHint, setShowTabHint] = useState(false)
  const [showLongWaitBanner, setShowLongWaitBanner] = useState(false)
  const [showDoneSlowMsg, setShowDoneSlowMsg] = useState(false)
  const [notifyGranted, setNotifyGranted] = useState(() =>
    typeof Notification !== 'undefined' && Notification.permission === 'granted'
  )
  const transcribeStartRef = useRef<number | null>(null)
  const elapsedTxMinRef = useRef(0)

  // ── Derived state
  const canStart = state === 'idle' && whisperState === 'ready'
  const isRecording = state === 'recording'
  const isProcessing = state === 'processing'
  const isTranscribing = state === 'done' && whisperState === 'transcribing'
  const isDone = state === 'done' && whisperState === 'done'
  const showNotesArea = isRecording || isProcessing || isTranscribing || isDone
  const shortcutLabel = IS_MAC ? '⌘E' : 'Ctrl+E'

  const resetChunked = useCallback(() => {}, [])
  useEffect(() => {
    if (!isRecording || !chunkSession) return
    // Chunked transcription disabilitata — reintrodurre in Fase G (Tauri)
    // con sherpa-onnx nativo che non compete con Whisper WASM
  }, [isRecording, chunkSession])

  // ── Export data builder
  function buildExportData() {
    const now = Date.now()
    const date = new Date(now).toLocaleString(i18n.language, {
      day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
    return {
      title: `Meeting — ${date}`,
      date,
      duration: duration > 0 ? `${Math.ceil(duration / 60)} min` : '—',
      lang: LANG_LABEL[language] ?? language,
      content: synthesis,
      segments,
      showTimestamps,
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
    if (isFree) return
    fetchCloudQuota().then(q => {
      if (q) setCloudInlineQuota(q.minutesRemaining)
    })
  }, [isFree])

  useEffect(() => {
    if (!audioData) return
    if (mode === 'cloud') {
      if (!audioBlob || hasTriggeredCloudRef.current) return
      hasTriggeredCloudRef.current = true
      setWhisperState('transcribing')
      cloudTx.transcribe(audioBlob, language)
      return
    }
    if (whisperState !== 'ready') return
    whisper.transcribe(audioData, language)
  }, [audioData, whisperState, mode])

  useEffect(() => {
    if (cloudTx.status === 'done') {
      setTranscript(cloudTx.transcript)
      setSegments((cloudTx.segments as WhisperSegment[]) ?? [])
      setWhisperState('done')
    } else if (cloudTx.status === 'error') {
      setWhisperState('error')
    }
  }, [cloudTx.status])

  // ── DB save
  useEffect(() => {
    if (synthesisState !== 'done') return
    const id = meetingIdRef.current
    if (!id) return
    const now = Date.now()
    const autoTitle = formatMeetingTitle(new Date(now))
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
        ...(participants.length > 0 && { participants }),
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
    let rafId: number
    function tick() {
      const elapsed = Date.now() - startTime
      // Fino al 85% segue stima temporale, poi rallenta verso 99% per non bloccarsi
      const fastPct = Math.round((elapsed / estimated) * 85)
      const pct = fastPct < 85
        ? fastPct
        : Math.min(99, 85 + Math.round((elapsed - estimated * 0.85 / estimated) / 1000 * 0.5))
      setTranscribeProgress(pct)
      rafId = requestIdleCallback(() => tick(), { timeout: 2000 })
    }
    rafId = requestIdleCallback(() => tick(), { timeout: 2000 })
    return () => cancelIdleCallback(rafId)
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

    // B4: inform user if they waited more than 5 minutes (once per user)
    const elapsedMin = transcribeStartRef.current
      ? (Date.now() - transcribeStartRef.current) / 60_000
      : 0
    if (elapsedMin > 5 && !localStorage.getItem('sb_slow_tx_educated')) {
      elapsedTxMinRef.current = elapsedMin
      setShowDoneSlowMsg(true)
    }

    notifyTranscriptionDone(
      i18n.t('recording.notification_title'),
      i18n.t('recording.notification_body'),
      sessionTitleRef.current.trim() || undefined,
    )

    // Usa l'ultimo sessionId noto (chunkSession potrebbe essere già null)
    const sessionIdToDelete = lastSessionIdRef.current
    if (sessionIdToDelete) {
      db.recording_sessions.delete(sessionIdToDelete).catch(() => {})
      lastSessionIdRef.current = null
    }

    return () => clearTimeout(t)
  }, [whisperState])

  useEffect(() => { sessionTitleRef.current = sessionTitle }, [sessionTitle])

  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState !== 'hidden') return
      if (mode === 'cloud') return
      if (whisperState !== 'transcribing') return
      if (backgroundWarningShownRef.current) return
      backgroundWarningShownRef.current = true
      toast.warning(i18n.t('recording.background_warning'))
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [whisperState, mode])

  // ── Track transcription start time (for B4)
  useEffect(() => {
    if (isTranscribing) transcribeStartRef.current = Date.now()
  }, [isTranscribing])

  // ── B2: tab-open hint after 60s (skip for fast/ultrafast tier and cloud)
  useEffect(() => {
    if (!isTranscribing) { setShowTabHint(false); return }
    if (!isSlowHardware || mode === 'cloud') return
    const timer = setTimeout(() => setShowTabHint(true), 60_000)
    return () => clearTimeout(timer)
  }, [isTranscribing, isSlowHardware, mode])

  // ── B3: long-wait banner after 3 minutes
  useEffect(() => {
    if (!isTranscribing) { setShowLongWaitBanner(false); return }
    const timer = setTimeout(() => setShowLongWaitBanner(true), 180_000)
    return () => clearTimeout(timer)
  }, [isTranscribing])

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
  // ── Ollama pre-flight check
  async function checkOllamaReady(): Promise<boolean> {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 3000)
      const res = await fetch('http://localhost:11434/api/version', { signal: controller.signal })
      clearTimeout(timeout)
      if (!res.ok) return false

      const tagsController = new AbortController()
      const tagsTimeout = setTimeout(() => tagsController.abort(), 3000)
      const tagsRes = await fetch('http://localhost:11434/api/tags', { signal: tagsController.signal })
      clearTimeout(tagsTimeout)
      if (!tagsRes.ok) return false

      const savedModel = localStorage.getItem('sonabrief_ollama_model')
      if (!savedModel) return false

      const tagsData = await tagsRes.json() as { models?: { name: string }[] }
      return tagsData.models?.some(m => m.name === savedModel) ?? false
    } catch {
      return false
    }
  }

  // ── Synthesis
  async function generateSynthesis() {
    meetingIdRef.current = crypto.randomUUID()
    setSynthesisState('streaming')
    setSynthesis('')

    const combinedNotes = buildNotesForSynthesis()

    if (mode === 'local') {
      const ready = await checkOllamaReady()
      if (!ready) {
        setSynthesisState('idle')
        pendingSynthesisRef.current = true
        setShowOllamaModal(true)
        return
      }

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
          // system_prompt NON viene più inviato: il server lo ricostruisce
          // server-side da template_id (ownership check + fallback sicuro).
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
    const autoTitle = formatMeetingTitle(new Date(now))
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
          ...(participants.length > 0 && { participants }),
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
      alert(t('recording.pip_not_supported'))
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
            stream: stream ?? null,
            initialNotes: notes,
            onPause: () => { pause(); render(duration, true) },
            onResume: () => { resume(); render(duration, false) },
            onStop: () => { handleStop(); pipWin.close() },
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
    cloudTx.reset()
    hasTriggeredCloudRef.current = false
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
          {t('recording.mobile_title')}
        </h2>
        <p className="text-muted-foreground text-sm max-w-sm">
          {t('recording.mobile_hint')}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <h1 className="sr-only">{t('recording.title')} — Sonabrief</h1>
      <AppNav />

      <main className="mx-auto max-w-4xl px-6 py-10">
        {state === 'idle' && (
          <button
            onClick={() => navigate('/dashboard')}
            className="mb-6 flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground motion-reduce:transition-none"
          >
            <span aria-hidden="true">←</span>
            Dashboard
          </button>
        )}
        {state === 'idle' && <RecoveryBanner />}
        <div className="lg:grid lg:grid-cols-[3fr_2fr] lg:gap-10">

          {/* ── Left column: recording workspace ──────────────────── */}
          <div className="space-y-7">

            <h2 className="font-heading text-2xl font-bold text-foreground tracking-[-0.015em]">
              {t('recording.title')}
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
                      <p className="text-sm font-semibold text-primary">{t('recording.ai_preparing')}</p>
                      <p className="text-xs text-primary/70">{t('recording.ai_preparing_hint')}</p>
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
                  <p className="text-sm font-semibold text-green-700 dark:text-green-400">{t('recording.ready')}</p>
                </motion.div>
              )}
            </AnimatePresence>

            {whisperState === 'loading' && !showLoadingBanner && (
              <p className="text-xs text-muted-foreground animate-pulse motion-reduce:animate-none">
                {t('recording.preparing')}
              </p>
            )}

            {/* Source selector — visible when idle */}
            <AnimatePresence mode="wait">
              {state === 'idle' && (
                <motion.section key="source" {...fadeUp} aria-labelledby="source-heading">
                  <p
                    id="source-heading"
                    className="mb-2.5 text-xs font-medium uppercase tracking-widest text-muted-foreground"
                  >
                    {t('recording.audio_source')}
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
                    {t('recording.language_label')}
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
                    {t('recording.synthesis_mode')}
                  </legend>
                  <div className="flex gap-2">
                    {orderedModeOptions.map(m => {
                      const isCloud = m.id === 'cloud'
                      const isLocked = isCloud && isFree
                      const Icon = m.icon
                      return (
                        <button
                          key={m.id}
                          onClick={() => { if (!isLocked) setMode(m.id) }}
                          disabled={!canStart}
                          title={isLocked ? t('recording.mode_cloud_locked_tooltip') : undefined}
                          aria-disabled={isLocked || undefined}
                          className={`flex flex-1 flex-col gap-0.5 rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-40 ${
                            mode === m.id
                              ? 'border-primary bg-primary/10'
                              : isLocked
                              ? 'border-border bg-card opacity-60 cursor-not-allowed'
                              : 'border-border bg-card hover:bg-muted'
                          }`}
                        >
                          <div className={`flex items-center gap-1.5 ${mode === m.id ? 'text-primary' : 'text-foreground'}`}>
                            {Icon && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                            <span className="text-xs font-semibold">{m.label}</span>
                            {isLocked && <Lock className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />}
                          </div>
                          <span className={`text-[10px] leading-snug ${mode === m.id ? 'text-primary/70' : 'text-muted-foreground'}`}>
                            {m.desc}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                  {mode === 'cloud' && !isFree && cloudInlineQuota !== null && (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      {t('recording.cloud_quota_inline', { hours: (cloudInlineQuota / 60).toFixed(1) })}
                    </p>
                  )}
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
                  {t('recording.session_title_label')}
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

            {/* Meeting URL link — visible when navigated from calendar */}
            {prefillMeetingUrl && state === 'idle' && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 space-y-3">
                <p className="text-xs font-semibold text-foreground">{t('recording.tab_instruction_title')}</p>
                <ol className="space-y-1.5 list-none">
                  <li className="flex gap-2 text-xs text-muted-foreground">
                    <span className="font-semibold text-primary shrink-0">1.</span>
                    <span>{t('recording.tab_instruction_1')}</span>
                  </li>
                  <li className="flex gap-2 text-xs text-muted-foreground">
                    <span className="font-semibold text-primary shrink-0">2.</span>
                    {t('recording.tab_instruction_2')}
                  </li>
                  <li className="flex gap-2 text-xs text-muted-foreground">
                    <span className="font-semibold text-primary shrink-0">3.</span>
                    {t('recording.tab_instruction_3')}
                  </li>
                </ol>
                <a
                  href={prefillMeetingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-primary px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 motion-reduce:transition-none"
                >
                  <Video className="h-3.5 w-3.5" />
                  {t('recording.open_meeting_link')}
                </a>
              </div>
            )}

            {/* Start button — idle + ready */}
            {canStart && (
              <div className="flex justify-center">
                <Button
                  onClick={() => {
                    localStorage.removeItem(NOTES_KEY)
                    setNotes('')
                    start(source)
                  }}
                  className="rounded-md px-8 hover:bg-(--primary-hover)"
                >
                  {t('recording.start_btn')}
                </Button>
              </div>
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
                        {formatDuration(duration)} <span className="text-2xl font-sans font-normal">{t('recording.paused_suffix')}</span>
                      </span>
                    ) : (
                      formatDuration(duration)
                    )}
                  </span>
                </div>

                <Waveform stream={stream ?? null} frozen={paused} />

                <p className="text-sm text-muted-foreground">
                  {paused ? t('recording.paused') : t('recording.in_progress')}
                </p>

                <div className="flex gap-3">
                  <Button
                    variant="destructive"
                    onClick={handleStop}
                    className="rounded-md"
                  >
                    {t('recording.stop_btn')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={paused ? resume : pause}
                    className="rounded-md"
                  >
                    {paused ? t('recording.resume_btn') : t('recording.pause_btn')}
                  </Button>
                </div>
                <Button
                  variant="outline"
                  onClick={pipActive ? () => { pipWindowRef.current?.close(); setPipActive(false) } : openPiP}
                  className="rounded-md text-xs"
                  title={t('recording.pip_title')}
                >
                  {pipActive ? t('recording.pip_close') : t('recording.pip_btn')}
                </Button>
              </motion.div>
              )}
            </AnimatePresence>

            {/* Processing: audio conversion */}
            {isProcessing && (
              <p className="text-sm text-muted-foreground">{t('recording.converting')}</p>
            )}

            {/* Transcribing: simulated progress bar */}
            <AnimatePresence mode="wait">
              {isTranscribing && (
              <motion.div key="transcribing" {...fadeUp} className="space-y-2">
                <p className="text-sm font-medium text-foreground">
                  {t('recording.transcribing', { progress: transcribeProgress })}
                </p>

                {/* B1 — Estimate block above progress bar */}
                {(() => {
                  const estimatedMin = estimateTranscriptionMinutes(duration / 60)
                  return (
                    <div className="rounded-lg border border-border bg-card px-3 py-2.5 space-y-2">
                      {mode === 'cloud' ? (
                        <p className="text-xs text-muted-foreground">{t('hardware.estimateFast')}</p>
                      ) : (
                        <>
                          <p className="text-xs text-muted-foreground">
                            {estimatedMin <= 1
                              ? t('hardware.estimateFast')
                              : t('hardware.estimateLabel', { minutes: estimatedMin })}
                          </p>
                          {estimatedMin > 2 && !notifyGranted && (
                            <button
                              onClick={handleRequestNotify}
                              className="text-xs font-medium text-primary hover:underline"
                            >
                              {t('hardware.notifyBtn')}
                            </button>
                          )}
                          {estimatedMin > 2 && isProPlus && (
                            <p className="text-xs text-muted-foreground/70">
                              {t('hardware.longWaitCloudHint')}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  )
                })()}

                <div
                  role="progressbar"
                  aria-valuenow={transcribeProgress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={t('recording.transcribing', { progress: transcribeProgress })}
                  className="h-1.5 w-full overflow-hidden rounded-full bg-border"
                >
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out motion-reduce:transition-none"
                    style={{ width: `${transcribeProgress}%` }}
                  />
                </div>

                {/* B2 — Tab-open hint after 60s */}
                {showTabHint && (
                  <p className="text-xs text-muted-foreground">
                    {t('hardware.keepTabOpen')}
                  </p>
                )}

                {mode !== 'cloud' && (
                  <p className="text-xs text-muted-foreground/70">
                    {t('recording.transcribing_local')}
                  </p>
                )}
              </motion.div>
              )}
            </AnimatePresence>

            {/* B3 — Long-wait banner after 3 minutes */}
            {showLongWaitBanner && isTranscribing && (
              <div className="rounded-xl border border-border bg-card px-4 py-3.5 flex items-start gap-3">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary/60" aria-hidden="true" />
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-foreground">
                    {t('hardware.longWaitBanner')}
                  </p>
                  {isProPlus && (
                    <p className="text-xs text-muted-foreground">
                      {t('hardware.longWaitCloudHint')}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Cloud Veloce transcription error */}
            {state === 'done' && cloudTx.status === 'error' && cloudTx.error && (
              <div className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
                <p className="text-sm font-medium text-destructive">
                  {cloudTx.error.kind === 'quota'
                    ? t('recording.cloud_quota_error')
                    : cloudTx.error.kind === 'not_available'
                    ? t('recording.cloud_not_available')
                    : cloudTx.error.kind === 'rate_limited'
                    ? t('recording.cloud_rate_limited')
                    : t('recording.error_prefix', { error: cloudTx.error.message })}
                </p>
                {cloudTx.error.kind === 'rate_limited' ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        hasTriggeredCloudRef.current = true
                        setWhisperState('transcribing')
                        cloudTx.retry()
                      }}
                      className="rounded-md"
                    >
                      {t('recording.cloud_retry_cloud')}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        cloudTx.reset()
                        setMode('standard')
                        setWhisperState('ready')
                      }}
                      className="rounded-md"
                    >
                      {t('recording.cloud_retry_local')}
                    </Button>
                  </div>
                ) : (
                  <Button variant="outline" onClick={handleNewRecording} className="rounded-md">
                    {t('recording.retry')}
                  </Button>
                )}
              </div>
            )}

            {/* Transcription complete flash */}
            {isDone && showTranscribeComplete && (
              <p className="text-sm font-medium text-primary">{t('recording.transcript_done')}</p>
            )}

            {/* B4 — Done-slow message (shown once if waited >5 min) */}
            {isDone && showDoneSlowMsg && (
              <div className="rounded-xl border border-border bg-card px-4 py-3.5 flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary/60" aria-hidden="true" />
                <div className="flex-1 space-y-1.5">
                  <p className="text-sm text-foreground">
                    {isFree
                      ? t('hardware.doneSlowFree', { minutes: Math.round(elapsedTxMinRef.current) })
                      : t('hardware.doneSlowPro', { minutes: Math.round(elapsedTxMinRef.current) })
                    }
                  </p>
                  {isFree && (
                    <a
                      href="/pricing"
                      className="inline-block text-xs font-medium text-primary hover:underline"
                      onClick={() => { localStorage.setItem('sb_slow_tx_educated', '1'); setShowDoneSlowMsg(false) }}
                    >
                      {t('hardware.doneSlowFreeCta')}
                    </a>
                  )}
                </div>
                <button
                  onClick={() => { localStorage.setItem('sb_slow_tx_educated', '1'); setShowDoneSlowMsg(false) }}
                  className="shrink-0 text-muted-foreground/60 hover:text-foreground transition-colors"
                  aria-label="Chiudi"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
              </div>
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
                        {t('recording.transcript_label')}
                      </span>
                      <div className="flex items-center gap-3">
                        {transcriptOpen && (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={e => { e.stopPropagation(); setShowTimestamps(prev => !prev) }}
                            onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); setShowTimestamps(prev => !prev) } }}
                            className="text-xs text-muted-foreground transition-colors hover:text-foreground motion-reduce:transition-none"
                          >
                            {showTimestamps ? t('recording.hide_timestamps') : t('recording.show_timestamps')}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {transcriptOpen ? t('recording.hide_transcript') : t('recording.show_transcript')}
                        </span>
                      </div>
                    </button>
                    {transcriptOpen && (
                      <div
                        id="transcript-content"
                        className="border-t border-border px-4 pb-4 pt-3"
                      >
                        <TranscriptViewer
                          segments={segments}
                          rawText={transcript}
                          showTimestamps={showTimestamps}
                        />
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-1.5">
                  <label
                    htmlFor="session-title-done"
                    className="block text-xs font-medium uppercase tracking-widest text-muted-foreground"
                  >
                    {t('recording.session_title_label')} <span className="normal-case tracking-normal text-muted-foreground/60">{t('recording.optional')}</span>
                  </label>
                  <input
                    id="session-title-done"
                    type="text"
                    value={sessionTitle}
                    onChange={e => setSessionTitle(e.target.value)}
                    placeholder={t('recording.title_placeholder')}
                    className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>

                {/* Template selector + client/project + generate */}
                {synthesisState === 'idle' && (
                  <div className="space-y-3">
                    {templates.length > 0 && (
                      <div>
                        <label
                          htmlFor="template-select"
                          className="mb-1.5 block text-xs font-medium text-muted-foreground"
                        >
                          {t('recording.meeting_type_label')}
                        </label>
                        <select
                          id="template-select"
                          value={selectedTemplate}
                          onChange={e => setSelectedTemplate(e.target.value)}
                          className="max-w-xs w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                        >
                          {templates.map(t => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Client / project / tags — collapsible */}
                    <div>
                      <button
                        onClick={() => setShowMetadata(o => !o)}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <span>{showMetadata ? '−' : '+'}</span>
                        {showMetadata ? t('recording.hide_details') : t('recording.add_details')}
                      </button>
                      {showMetadata && (
                        <div className="mt-3 space-y-2.5">
                          <div>
                            <label
                              htmlFor="client-name"
                              className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-muted-foreground"
                            >
                              {t('recording.client_label')} <span className="normal-case tracking-normal text-muted-foreground/60">{t('recording.optional')}</span>
                            </label>
                            {clientSuggestion && !clientName && (
                              <button
                                onClick={() => setClientName(clientSuggestion)}
                                className="mb-1.5 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20 motion-reduce:transition-none"
                              >
                                {t('recording.suggestion_use', { suggestion: clientSuggestion })}
                              </button>
                            )}
                            <input
                              id="client-name"
                              type="text"
                              value={clientName}
                              onChange={e => setClientName(e.target.value)}
                              placeholder={t('recording.client_placeholder')}
                              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                            />
                          </div>
                          <div>
                            <label
                              htmlFor="project-stream"
                              className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-muted-foreground"
                            >
                              {t('recording.project_label')} <span className="normal-case tracking-normal text-muted-foreground/60">{t('recording.optional')}</span>
                            </label>
                            <input
                              id="project-stream"
                              type="text"
                              value={projectStream}
                              onChange={e => setProjectStream(e.target.value)}
                              placeholder={t('recording.project_placeholder')}
                              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                            />
                          </div>
                          <div>
                            <label className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-muted-foreground">
                              {t('recording.tag_label')} <span className="normal-case tracking-normal text-muted-foreground/60">{t('recording.optional')}</span>
                            </label>
                            {isFree ? (
                              <div className="flex items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-2">
                                <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                                <span className="text-xs text-muted-foreground">
                                  {t('recording.tags_pro_hint')}{' '}
                                  <button
                                    onClick={() => navigate('/pricing')}
                                    className="font-medium text-primary hover:underline"
                                  >
                                    {t('recording.pro_link')}
                                  </button>
                                </span>
                              </div>
                            ) : (
                              <TagInput value={meetingTags} onChange={setMeetingTags} />
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <Button
                      onClick={generateSynthesis}
                      className="w-full rounded-md hover:bg-(--primary-hover)"
                    >
                      {t('recording.generate_synthesis')}
                    </Button>
                    <button
                      onClick={saveTranscriptOnly}
                      className="w-full text-xs text-muted-foreground transition-colors hover:text-foreground motion-reduce:transition-none"
                    >
                      {t('recording.save_transcript_only')}
                    </button>
                  </div>
                )}

                {/* Synthesis editor */}
                {(synthesisState === 'streaming' || synthesisState === 'done') && (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      {t('recording.synthesis_label')}
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
                          {t('recording.export_markdown')}
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
                          {copyDone ? t('recording.copied') : t('recording.copy_text')}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {synthesisState === 'error' && (
                  <p className="text-sm text-destructive">{t('recording.synthesis_error')}</p>
                )}

                {/* Post-recording navigation */}
                <div className="flex flex-col items-center gap-2 pt-2">
                  <Button variant="outline" onClick={handleNewRecording} className="w-full rounded-md">
                    {t('recording.new_recording')}
                  </Button>
                  <button
                    onClick={() => navigate('/archive')}
                    className="text-xs text-muted-foreground transition-colors hover:text-foreground motion-reduce:transition-none"
                  >
                    {t('recording.go_archive')}
                  </button>
                </div>
              </motion.div>
              )}
            </AnimatePresence>

            {/* Error: recorder failed */}
            {state === 'error' && (
              <div className="space-y-3">
                <p className="text-sm text-destructive">{t('recording.error_prefix', { error })}</p>
                <Button variant="outline" onClick={handleNewRecording} className="rounded-md">
                  {t('recording.retry')}
                </Button>
              </div>
            )}

          </div>

          {/* ── Right sidebar ─────────────────────────────────────── */}
          <aside
            className="mt-8 space-y-6 lg:mt-0"
            aria-label={t('recording.notes_aside_aria')}
          >

            {/* Briefing context — always visible */}
            {isFree ? (
              <div className="flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="text-xs text-muted-foreground">
                  {t('recording.briefing_pro_hint')}{' '}
                  <button
                    onClick={() => navigate('/pricing')}
                    className="font-medium text-primary hover:underline"
                  >
                    {t('recording.pro_link')}
                  </button>
                </span>
              </div>
            ) : (
              <MeetingBriefing />
            )}

            {!isFree && mode === 'cloud' && <CloudQuotaWidget />}

            {/* Quick notes — during recording */}
            {isRecording && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                    {t('recording.quick_notes_label')}
                  </p>
                  <button
                    onClick={triggerQuickNote}
                    className="flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    aria-label={`${t('recording.add_note')} (${shortcutLabel})`}
                  >
                    <span className="text-xs text-muted-foreground">{t('recording.add_note')}</span>
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
                      placeholder={t('recording.note_placeholder')}
                      className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {t('recording.note_hint')}
                    </p>
                  </div>
                )}

                {quickNotes.length === 0 && !showQuickNoteInput && (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {t('recording.highlight_hint')}
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
                  {t('recording.notes_label')}
                </label>
                <textarea
                  id="recording-notes"
                  value={notes}
                  onChange={e => handleNotesChange(e.target.value)}
                  placeholder={t('recording.notes_placeholder')}
                  className="w-full resize-none rounded-md border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                  style={{ minHeight: '160px' }}
                />
                <p className="mt-1 text-xs text-muted-foreground">{t('recording.autosave')}</p>
              </div>
            )}

          </aside>
        </div>
      </main>

      {showOllamaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-background shadow-xl">
            <OllamaSetupFlow
              onComplete={() => {
                setShowOllamaModal(false)
                if (pendingSynthesisRef.current) {
                  pendingSynthesisRef.current = false
                  generateSynthesis()
                }
              }}
              onCancel={() => {
                setShowOllamaModal(false)
                pendingSynthesisRef.current = false
              }}
            />
          </div>
        </div>
      )}

      {/* B5 — Hardware suggestion modal (once, Pro/PU only, slow/medium hardware) */}
      {isProPlus && (
        <HardwareSuggestionModal
          onTryCloud={() => setMode('cloud')}
          onContinueLocal={() => {}}
        />
      )}
    </div>
  )
}
