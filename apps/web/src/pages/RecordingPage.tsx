import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAudioRecorder } from '../hooks/useAudioRecorder'
import { whisper } from '../lib/whisper'
import { Button } from '../components/ui/button'

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

  useEffect(() => {
    whisper.init()
    const unsub = whisper.on((event) => {
      console.log('whisper event:', event)
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
    whisper.load('Xenova/whisper-tiny.en')
    return () => {
      unsub()
      whisper.destroy()
    }
  }, [])

  useEffect(() => {
    if (audioData && whisperState === 'ready') {
      whisper.transcribe(audioData)
    }
  }, [audioData, whisperState])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <h1 className="text-2xl font-semibold">Nuovo meeting</h1>

      {/* Stato Whisper */}
      {whisperState === 'loading' && (
        <p className="text-sm text-gray-400">
          Caricamento modello AI... {whisperProgress > 0 ? `${whisperProgress}%` : ''}
        </p>
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
        <button
          onClick={() => navigate('/dashboard')}
          className="text-sm text-gray-400 underline"
        >
          Annulla
        </button>
      )}
    </div>
  )
}