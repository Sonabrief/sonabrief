import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAudioRecorder } from '../hooks/useAudioRecorder'
import { whisper } from '../lib/whisper'
import { Button } from '../components/ui/button'
import { API_URL } from '../config'
import { SynthesisEditor } from '../components/SynthesisEditor'
import { db } from '../lib/db'
import { synthesizeWithOllama } from '../lib/ollama'
import { syncMeetingNow } from '../lib/sync'
import { isUnlocked } from '../lib/keystore'
import { exportMarkdown, exportPDF, exportWord, exportEmail, copyFormatted } from '../lib/export'

const LANG_LABEL: Record<string, string> = {
  it: 'Italiano', en: 'English', fr: 'Français', es: 'Español', de: 'Deutsch',
}

const SYSTEM_PROMPT =
  'Sei un assistente esperto nella redazione di verbali aziendali. ' +
  'Analizza la trascrizione del meeting e produci un verbale sintetico strutturato in: ' +
  'riepilogo esecutivo, punti chiave discussi, decisioni prese, prossimi passi con eventuali responsabili. ' +
  'Rileva automaticamente la lingua parlata nel meeting dalla trascrizione e scrivi il verbale nella stessa lingua. ' +
  'Se sono presenti note manuali del partecipante, integrале nel verbale come contesto aggiuntivo, segnalando che provengono dalle note personali.'
 
function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}
 
// ─── Waveform ────────────────────────────────────────────────────────────────
 
function Waveform({ stream }: { stream: MediaStream | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
 
  useEffect(() => {
    if (!stream) return
    const audioCtx = new AudioContext()
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 64
    audioCtx.createMediaStreamSource(stream).connect(analyser)
    analyserRef.current = analyser
    ctxRef.current = audioCtx
 
    const data = new Uint8Array(analyser.frequencyBinCount)
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const BAR_COUNT = 20
    const GAP = 3
 
    function draw() {
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
 
// ─── Highlights ──────────────────────────────────────────────────────────────
 
interface Highlight {
  ts: number   // secondi dall'inizio registrazione
  label: string
}
 
// ─── Note panel ──────────────────────────────────────────────────────────────
 
const NOTES_KEY = 'sonabrief_recording_notes'
 
function NotesPanel({ visible }: { visible: boolean }) {
  const [text, setText] = useState('')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
 
  function handleChange(val: string) {
    setText(val)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      localStorage.setItem(NOTES_KEY, val)
    }, 800)
  }
 
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current) }, [])
 
  if (!visible) return null
 
  return (
    <div className="fixed right-4 top-4 bottom-4 w-64 flex flex-col bg-white border border-gray-200 rounded-xl shadow-lg z-50">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Note</span>
        <span className="text-[10px] text-gray-300">autosalvataggio</span>
      </div>
      <textarea
        className="flex-1 resize-none p-3 text-sm text-gray-700 placeholder-gray-300 focus:outline-none rounded-b-xl"
        placeholder="Scrivi note durante il meeting…"
        value={text}
        onChange={e => handleChange(e.target.value)}
      />
    </div>
  )
}
 
// ─── Page ────────────────────────────────────────────────────────────────────
 
export default function RecordingPage() {
  const navigate = useNavigate()
  const { state, duration, error, start, stop, audioData, reset, stream } = useAudioRecorder()
  const [whisperState, setWhisperState] = useState<'loading' | 'ready' | 'transcribing' | 'done' | 'error'>('loading')
  const [whisperProgress, setWhisperProgress] = useState(0)
  const [transcript, setTranscript] = useState('')
  const [synthesisState, setSynthesisState] = useState<'idle' | 'streaming' | 'done' | 'error'>('idle')
  const [synthesis, setSynthesis] = useState('')
  const [language, setLanguage] = useState<'it' | 'en' | 'fr' | 'es' | 'de'>('it')
  const [mode, setMode] = useState<'standard' | 'local'>('standard')
  const [highlights, setHighlights] = useState<Highlight[]>([])
  const [notesOpen, setNotesOpen] = useState(false)
  const [copyDone, setCopyDone] = useState(false)
  const [templates, setTemplates] = useState<{ id: string; name: string }[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<string>('sys_generic_it_v2')
  const meetingIdRef = useRef('')

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
 
  // ── Whisper init
  useEffect(() => {
    whisper.init()
    const unsub = whisper.on((event) => {
      if (event.type === 'loading') setWhisperProgress(event.progress)
      if (event.type === 'ready') setWhisperState('ready')
      if (event.type === 'transcribing') setWhisperState('transcribing')
      if (event.type === 'result') { setTranscript(event.text); setWhisperState('done') }
      if (event.type === 'error') setWhisperState('error')
    })
    whisper.load('Xenova/whisper-base')
    fetch(`${API_URL}/v1/templates`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : { templates: [] })
      .then((data: { templates: { id: string; name: string }[] }) => {
        if (data.templates?.length) setTemplates(data.templates)
      })
      .catch(() => {})
    return () => { unsub(); whisper.destroy() }
  }, [])
 
  useEffect(() => {
    if (audioData && whisperState === 'ready') whisper.transcribe(audioData, language)
  }, [audioData, whisperState])
 
  // ── Salvataggio DB
  useEffect(() => {
    if (synthesisState !== 'done') return
    const id = meetingIdRef.current
    if (!id) return
    const now = Date.now()
    const title = new Date(now).toLocaleString(language, {
      day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
    db.transaction('rw', [db.meetings, db.transcripts, db.notes], async () => {
      await db.meetings.add({
        id, title,
        startedAt: now - duration * 1000,
        endedAt: now,
        durationSeconds: duration,
        mode: 'standard',
        lang: language,
        createdAt: now,
        updatedAt: now,
      })
      await db.transcripts.add({ id: crypto.randomUUID(), meetingId: id, text: transcript, createdAt: now })
      await db.notes.add({
        id: crypto.randomUUID(), meetingId: id, content: synthesis,
        generatedAt: now, createdAt: now, updatedAt: now,
      })
    }).then(() => {
      if (localStorage.getItem('sonabrief_sync_enabled') === 'true' && isUnlocked()) {
        syncMeetingNow(id)
      }
    }).catch(err => console.error('[db] salvataggio meeting fallito:', err))
  }, [synthesisState])
 
  // ── Highlight hotkey
  const addHighlight = useCallback(() => {
    if (state !== 'recording') return
    setHighlights(prev => [...prev, { ts: duration, label: `Highlight ${prev.length + 1}` }])
  }, [state, duration])
 
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'e' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        addHighlight()
      }
      if (e.key === 'm' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        if (state === 'recording') setNotesOpen(o => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [addHighlight, state])
 
  // ── Sintesi
  async function generateSynthesis() {
    meetingIdRef.current = crypto.randomUUID()
    setSynthesisState('streaming')
    setSynthesis('')

    const notes = localStorage.getItem('sonabrief_recording_notes')?.trim() || undefined

    if (mode === 'local') {
      await synthesizeWithOllama(
        transcript,
        language,
        notes,
        SYSTEM_PROMPT,
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
          system_prompt: SYSTEM_PROMPT,
          template_id: selectedTemplate,
          audio_minutes: Math.ceil(duration / 60),
          notes,
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
 
  function handleNewRecording() {
    reset()
    setTranscript('')
    setSynthesis('')
    setSynthesisState('idle')
    setHighlights([])
    setNotesOpen(false)
    setCopyDone(false)
    meetingIdRef.current = ''
    localStorage.removeItem(NOTES_KEY)
    setSelectedTemplate('sys_generic_it_v2')
    if (whisperState === 'error') setWhisperState('ready')
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <h1 className="text-2xl font-semibold">Nuovo meeting</h1>
 
      {/* Stato Whisper */}
      {whisperState === 'loading' && (
        <div className="flex flex-col items-center gap-2 w-full max-w-xs">
          <p className="text-sm text-gray-400">
            {whisperProgress > 0 ? `Caricamento modello... ${whisperProgress}%` : 'Inizializzazione modello AI...'}
          </p>
          {whisperProgress > 0 && (
            <div className="w-full bg-gray-200 rounded-full h-1.5">
              <div
                className="bg-teal-700 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${whisperProgress}%` }}
              />
            </div>
          )}
          <p className="text-xs text-gray-300">Solo al primo utilizzo (~140MB)</p>
        </div>
      )}
 
      {/* Timer + waveform */}
      <div className="text-center space-y-3">
        <p className="text-5xl font-mono tracking-widest">{formatDuration(duration)}</p>
        {state === 'recording' && <Waveform stream={stream ?? null} />}
        <p className="text-sm text-gray-400">
          {state === 'idle' && whisperState === 'ready' && 'Scegli la sorgente audio e avvia'}
          {state === 'idle' && whisperState === 'loading' && 'Attendi il caricamento del modello...'}
          {state === 'recording' && '● Registrazione in corso...'}
          {state === 'processing' && 'Conversione audio...'}
          {state === 'done' && whisperState === 'transcribing' && 'Trascrizione in corso...'}
          {state === 'done' && whisperState === 'done' && 'Trascrizione completata'}
          {state === 'error' && `Errore: ${error}`}
        </p>
      </div>
 
      {/* Highlights durante registrazione */}
      {state === 'recording' && (
        <div className="flex flex-col items-center gap-2">
          <div className="flex gap-2 flex-wrap justify-center max-w-xs">
            {highlights.map((h, i) => (
              <span key={i} className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                ★ {formatDuration(h.ts)}
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={addHighlight}
              className="text-xs text-amber-600 border border-amber-300 rounded-full px-3 py-1 hover:bg-amber-50 transition-colors"
            >
              ★ Segna momento <span className="text-gray-400 ml-1">⌘E</span>
            </button>
            <button
              onClick={() => setNotesOpen(o => !o)}
              className="text-xs text-teal-600 border border-teal-200 rounded-full px-3 py-1 hover:bg-teal-50 transition-colors"
            >
              📝 Note <span className="text-gray-400 ml-1">⌘M</span>
            </button>
          </div>
        </div>
      )}
 
      {/* Trascrizione */}
      {transcript && (
        <div className="w-full max-w-xl bg-gray-50 rounded-lg p-4 text-sm text-gray-700 whitespace-pre-wrap">
          {transcript}
        </div>
      )}
 
      {/* Selettore template + bottone sintesi */}
      {whisperState === 'done' && transcript && synthesisState === 'idle' && (
        <div className="flex flex-col gap-3 w-full max-w-xl">
          {templates.length > 0 && (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-400">Tipo di meeting</label>
              <select
                value={selectedTemplate}
                onChange={e => setSelectedTemplate(e.target.value)}
                className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-600"
              >
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}
          <Button onClick={generateSynthesis}>Genera sintesi</Button>
        </div>
      )}
 
      {/* Sintesi */}
      {(synthesisState === 'streaming' || synthesisState === 'done') && (
        <div className="w-full max-w-xl">
          <p className="text-xs font-medium text-teal-700 mb-2 uppercase tracking-wide">Sintesi</p>
          <SynthesisEditor content={synthesis} />
          {synthesisState === 'streaming' && (
            <span className="mt-1 block text-sm text-gray-400 animate-pulse">▍</span>
          )}
          {synthesisState === 'done' && (
            <div className="flex flex-wrap gap-2 pt-3">
              {[
                { label: 'Markdown', action: () => exportMarkdown(buildExportData()) },
                { label: 'PDF', action: () => exportPDF(buildExportData()) },
                { label: 'Word', action: () => exportWord(buildExportData()) },
                { label: 'Email', action: () => exportEmail(buildExportData()) },
                {
                  label: copyDone ? 'Copiato ✓' : 'Copia testo',
                  action: async () => {
                    await copyFormatted(buildExportData())
                    setCopyDone(true)
                    setTimeout(() => setCopyDone(false), 2000)
                  },
                },
              ].map(btn => (
                <button
                  key={btn.label}
                  onClick={btn.action}
                  className="rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:border-teal-600 hover:text-teal-700 transition-colors"
                >
                  {btn.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
 
      {synthesisState === 'error' && (
        <p className="text-sm text-red-500">Errore durante la sintesi. Riprova.</p>
      )}
 
      {/* Selettore lingua e modalità */}
      {state === 'idle' && whisperState === 'ready' && (
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400">Lingua del meeting</label>
            <select
              value={language}
              onChange={e => setLanguage(e.target.value as typeof language)}
              className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-600"
            >
              <option value="it">Italiano</option>
              <option value="en">English</option>
              <option value="fr">Français</option>
              <option value="es">Español</option>
              <option value="de">Deutsch</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400">Modalità sintesi</label>
            <div className="flex gap-2">
              {(['standard', 'local'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm transition-colors ${
                    mode === m
                      ? 'border-teal-600 bg-teal-50 text-teal-700'
                      : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                  }`}
                >
                  {m === 'standard' ? '☁️ Standard' : '🔒 Local Only'}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
 
      {/* Controlli avvio */}
      {state === 'idle' && whisperState === 'ready' && (
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <Button onClick={() => { localStorage.removeItem(NOTES_KEY); start('microphone') }}>🎙 Solo microfono</Button>
          <Button variant="outline" onClick={() => { localStorage.removeItem(NOTES_KEY); start('tab') }}>🖥 Audio scheda browser</Button>
          <Button variant="outline" onClick={() => { localStorage.removeItem(NOTES_KEY); start('both') }}>🎙 + 🖥 Microfono e scheda</Button>
        </div>
      )}
 
      {state === 'recording' && (
        <Button variant="destructive" onClick={stop}>⏹ Ferma registrazione</Button>
      )}
 
      {(whisperState === 'done' || state === 'error') && (
        <div className="flex gap-3">
          <Button variant="outline" onClick={handleNewRecording}>Nuova registrazione</Button>
          <Button variant="outline" onClick={() => navigate('/dashboard')}>Torna alla dashboard</Button>
        </div>
      )}
 
      {state === 'idle' && (
        <div className="flex gap-4">
          <button onClick={() => navigate('/dashboard')} className="text-sm text-gray-400 underline">Annulla</button>
          <button onClick={() => navigate('/archive')} className="text-sm text-gray-400 underline">Archivio</button>
        </div>
      )}
 
      {/* Pannello note (overlay laterale) */}
      <NotesPanel visible={notesOpen} />
    </div>
  )
}