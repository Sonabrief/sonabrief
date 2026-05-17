import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAudioRecorder } from '../hooks/useAudioRecorder'
import { whisper } from '../lib/whisper'
import { Button } from '../components/ui/button'
import { API_URL } from '../config'
import { SynthesisEditor } from '../components/SynthesisEditor'
import { db } from '../lib/db'

const SYSTEM_PROMPT =
  'Sei un assistente esperto nella redazione di verbali aziendali. ' +
  'Analizza la trascrizione del meeting e produci un verbale sintetico strutturato in: ' +
  'riepilogo esecutivo, punti chiave discussi, decisioni prese, prossimi passi con eventuali responsabili. ' +
  'Rileva automaticamente la lingua parlata nel meeting dalla trascrizione e scrivi il verbale nella stessa lingua.'

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export default function RecordingPage() {
  const navigate = useNavigate()
  const { state, duration, error, start, stop, audioData, reset } = useAudioRecorder()
  const [whisperState, setWhisperState] = useState<'loading' | 'ready' | 'transcribing' | 'done' | 'error'>('loading')
  const [whisperProgress, setWhisperProgress] = useState(0)
  const [transcript, setTranscript] = useState<string>('')
  const [synthesisState, setSynthesisState] = useState<'idle' | 'streaming' | 'done' | 'error'>('idle')
  const [synthesis, setSynthesis] = useState<string>('')
  const [language, setLanguage] = useState<'it' | 'en' | 'fr' | 'es' | 'de'>('it')
  const meetingIdRef = useRef('')

  useEffect(() => {
    whisper.init()
    const unsub = whisper.on((event) => {
      if (event.type === 'loading') {
        setWhisperProgress(event.progress)
      }
      if (event.type === 'ready') {
        setWhisperState('ready')
      }
      if (event.type === 'transcribing') {
        setWhisperState('transcribing')
      }
      if (event.type === 'result') {
        setTranscript(event.text)
        setWhisperState('done')
      }
      if (event.type === 'error') {
        setWhisperState('error')
      }
    })
    whisper.load('Xenova/whisper-base')
    return () => {
      unsub()
      whisper.destroy()
    }
  }, [])

  useEffect(() => {
    if (audioData && whisperState === 'ready') {
      whisper.transcribe(audioData, language)
    }
  }, [audioData, whisperState])

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
        id,
        title,
        startedAt: now - duration * 1000,
        endedAt: now,
        durationSeconds: duration,
        mode: 'standard',
        lang: language,
        createdAt: now,
        updatedAt: now,
      })
      await db.transcripts.add({
        id: crypto.randomUUID(),
        meetingId: id,
        text: transcript,
        createdAt: now,
      })
      await db.notes.add({
        id: crypto.randomUUID(),
        meetingId: id,
        content: synthesis,
        generatedAt: now,
        createdAt: now,
        updatedAt: now,
      })
    }).catch(err => console.error('[db] salvataggio meeting fallito:', err))
  }, [synthesisState])

  async function generateSynthesis() {
    meetingIdRef.current = crypto.randomUUID()
    setSynthesisState('streaming')
    setSynthesis('')

    try {
      const response = await fetch(`${API_URL}/v1/synthesize`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript,
          meeting_id: meetingIdRef.current,
          language,
          system_prompt: SYSTEM_PROMPT,
          audio_minutes: Math.ceil(duration / 60),
        }),
      })

      if (!response.ok || !response.body) {
        setSynthesisState('error')
        return
      }

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
          } catch {
            // ignora righe SSE malformate
          }
        }
      }
    } catch {
      setSynthesisState('error')
    }
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

      {/* Timer */}
      <div className="text-center space-y-1">
        <p className="text-5xl font-mono tracking-widest">
          {formatDuration(duration)}
        </p>
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

      {/* Risultato trascrizione */}
      {transcript && (
        <div className="w-full max-w-xl bg-gray-50 rounded-lg p-4 text-sm text-gray-700 whitespace-pre-wrap">
          {transcript}
        </div>
      )}

      {/* Bottone sintesi */}
      {whisperState === 'done' && transcript && synthesisState === 'idle' && (
        <Button onClick={generateSynthesis}>
          Genera sintesi
        </Button>
      )}

      {/* Risultato sintesi */}
      {(synthesisState === 'streaming' || synthesisState === 'done') && (
        <div className="w-full max-w-xl">
          <p className="text-xs font-medium text-teal-700 mb-2 uppercase tracking-wide">Sintesi</p>
          <SynthesisEditor content={synthesis} />
          {synthesisState === 'streaming' && (
            <span className="mt-1 block text-sm text-gray-400 animate-pulse">▍</span>
          )}
        </div>
      )}

      {synthesisState === 'error' && (
        <p className="text-sm text-red-500">Errore durante la sintesi. Riprova.</p>
      )}

      {/* Selettore lingua */}
      {state === 'idle' && whisperState === 'ready' && (
        <div className="flex flex-col gap-1 w-full max-w-xs">
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
      )}

      {/* Controlli */}
      {state === 'idle' && whisperState === 'ready' && (
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <Button onClick={() => start('microphone')}>
            🎙 Solo microfono
          </Button>
          <Button variant="outline" onClick={() => start('tab')}>
            🖥 Audio scheda browser
          </Button>
          <Button variant="outline" onClick={() => start('both')}>
            🎙 + 🖥 Microfono e scheda
          </Button>
        </div>
      )}

      {state === 'recording' && (
        <Button variant="destructive" onClick={stop}>
          ⏹ Ferma registrazione
        </Button>
      )}

      {(whisperState === 'done' || state === 'error') && (
        <div className="flex gap-3">
          <Button variant="outline" onClick={reset}>
            Nuova registrazione
          </Button>
          <Button variant="outline" onClick={() => navigate('/dashboard')}>
            Torna alla dashboard
          </Button>
        </div>
      )}

      {state === 'idle' && (
        <div className="flex gap-4">
          <button
            onClick={() => navigate('/dashboard')}
            className="text-sm text-gray-400 underline"
          >
            Annulla
          </button>
          <button
            onClick={() => navigate('/archive')}
            className="text-sm text-gray-400 underline"
          >
            Archivio
          </button>
        </div>
      )}
    </div>
  )
}