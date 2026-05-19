import _sodium from 'libsodium-wrappers-sumo'
await _sodium.ready
const sodium = _sodium

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { unlockWithPassphrase, persistKeyToSession } from '../lib/keystore'
import { initCrypto, generateSalt, generateRecoveryPhrase } from '../lib/crypto'
import { Button } from '../components/ui/button'

type Step = 1 | 2 | 3 | 4

function Stepper({ current }: { current: Step }) {
  return (
    <div className="flex items-center justify-center mb-10">
      {([1, 2, 3, 4] as const).map((n, i) => (
        <div key={n} className="flex items-center">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-colors ${
              n === current
                ? 'border-[#1A4D52] bg-[#1A4D52] text-white'
                : n < current
                  ? 'border-[#1A4D52] bg-white text-[#1A4D52]'
                  : 'border-gray-200 bg-white text-gray-400'
            }`}
          >
            {n}
          </div>
          {i < 3 && (
            <div
              className={`w-12 h-0.5 ${n < current ? 'bg-[#1A4D52]' : 'bg-gray-200'}`}
            />
          )}
        </div>
      ))}
    </div>
  )
}

export default function SyncSetupPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>(1)

  // Step 2
  const [passphrase, setPassphrase] = useState('')
  const [passphraseConfirm, setPassphraseConfirm] = useState('')
  const [touched, setTouched] = useState({ passphrase: false, confirm: false })
  const [submitting, setSubmitting] = useState(false)

  // Step 3
  const [phrase, setPhrase] = useState<string[]>([])
  const [copied, setCopied] = useState(false)

  // Step 4
  const [checkIndices, setCheckIndices] = useState<[number, number, number]>([3, 6, 10])
  const [checkInputs, setCheckInputs] = useState<[string, string, string]>(['', '', ''])
  const [step4Attempted, setStep4Attempted] = useState(false)

  useEffect(() => {
    setPhrase(generateRecoveryPhrase())
  }, [])

  useEffect(() => {
    if (step !== 4) return
    const pool = Array.from({ length: 12 }, (_, i) => i)
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]]
    }
    const sorted = pool.slice(0, 3).sort((a, b) => a - b) as [number, number, number]
    setCheckIndices(sorted)
    setCheckInputs(['', '', ''])
  }, [step])

  const passphraseErrMsg =
    touched.passphrase && passphrase.length < 12 ? 'Minimo 12 caratteri' : ''
  const confirmErrMsg =
    touched.confirm && passphrase !== passphraseConfirm ? 'Le passphrase non coincidono' : ''
  const step2Valid = passphrase.length >= 12 && passphrase === passphraseConfirm

  async function handleStep2() {
    setTouched({ passphrase: true, confirm: true })
    if (!step2Valid) return
    setSubmitting(true)
    try {
      await initCrypto()
      const salt = generateSalt()
      await unlockWithPassphrase(passphrase, salt)
      localStorage.setItem('sonabrief_sync_salt', sodium.to_base64(salt))
      setStep(3)
    } finally {
      setSubmitting(false)
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(phrase.join(' '))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const step4Valid = checkIndices.every(
    (idx, i) => checkInputs[i].trim().toLowerCase() === phrase[idx]?.toLowerCase(),
  )

  async function handleActivate() {
    await persistKeyToSession()
    localStorage.setItem('sonabrief_sync_enabled', 'true')
    navigate('/dashboard')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="w-full max-w-md py-12">
        <Stepper current={step} />

        {step === 1 && (
          <div className="space-y-6">
            <h1 className="text-2xl font-semibold text-[#1A4D52]">Attiva il sync cifrato</h1>
            <p className="text-sm leading-relaxed text-gray-600">
              Le tue 12 parole di recovery sono l'unica strada per riaprire l'archivio se dimentichi la passphrase.
            </p>
            <p className="text-sm leading-relaxed text-gray-600">
              Le tue conversazioni sono cifrate in modo che nemmeno noi possiamo leggerle — e questo è il punto. Significa anche che senza le tue 12 parole nemmeno noi possiamo aiutarti a recuperarle.
            </p>
            <p className="text-sm leading-relaxed text-gray-600">
              Salvale ora: scrivile su carta, conservale dove conservi i documenti importanti. È un'operazione che fai una volta sola, e ti garantisce che i tuoi clienti restino solo tuoi.
            </p>
            <Button
              className="w-full bg-[#1A4D52] hover:bg-[#1A4D52]/90 text-white"
              onClick={() => setStep(2)}
            >
              Ho capito, continua
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <h1 className="text-2xl font-semibold text-[#1A4D52]">Crea la tua passphrase</h1>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Passphrase</label>
              <input
                type="password"
                value={passphrase}
                onChange={e => setPassphrase(e.target.value)}
                onBlur={() => setTouched(t => ({ ...t, passphrase: true }))}
                placeholder="Almeno 12 caratteri"
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A4D52]/40"
              />
              {passphraseErrMsg && (
                <p className="text-xs text-red-600">{passphraseErrMsg}</p>
              )}
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Conferma passphrase</label>
              <input
                type="password"
                value={passphraseConfirm}
                onChange={e => setPassphraseConfirm(e.target.value)}
                onBlur={() => setTouched(t => ({ ...t, confirm: true }))}
                placeholder="Ripeti la passphrase"
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A4D52]/40"
              />
              {confirmErrMsg && (
                <p className="text-xs text-red-600">{confirmErrMsg}</p>
              )}
            </div>
            <Button
              className="w-full bg-[#1A4D52] hover:bg-[#1A4D52]/90 text-white"
              onClick={handleStep2}
              disabled={!step2Valid || submitting}
            >
              {submitting ? 'Derivazione chiave…' : 'Continua'}
            </Button>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold text-[#1A4D52]">Salva queste 12 parole</h1>
              <p className="text-sm leading-relaxed text-gray-600">
                Servono per recuperare l'accesso se dimentichi la passphrase. Scrivile
                su carta o in un password manager. Non saranno mai più mostrate.
              </p>
            </div>
            <div
              className="grid grid-cols-3 gap-2 rounded-lg border p-4"
              style={{ backgroundColor: '#FAF7F0', borderColor: '#C8986866' }}
            >
              {phrase.map((word, i) => (
                <div key={i} className="flex items-baseline gap-1.5">
                  <span className="w-5 shrink-0 text-right font-mono text-xs text-gray-400">
                    {i + 1}.
                  </span>
                  <span className="font-mono text-sm text-gray-800">{word}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 border-[#C89868] text-[#C89868] hover:bg-[#C89868]/10"
                onClick={handleCopy}
              >
                {copied ? 'Copiato!' : 'Copia tutto'}
              </Button>
              <Button
                className="flex-1 bg-[#1A4D52] hover:bg-[#1A4D52]/90 text-white"
                onClick={() => setStep(4)}
              >
                Le ho salvate, continua
              </Button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6">
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold text-[#1A4D52]">
                Conferma di aver salvato la recovery phrase
              </h1>
              <p className="text-sm text-gray-600">
                Inserisci le parole richieste dalla tua recovery phrase.
              </p>
            </div>
            <div className="space-y-4">
              {checkIndices.map((idx, i) => (
                <div key={idx} className="space-y-1">
                  <label className="text-sm font-medium text-gray-700">
                    Parola N. {idx + 1}
                  </label>
                  <input
                    type="text"
                    value={checkInputs[i]}
                    onChange={e =>
                      setCheckInputs(prev => {
                        const next: [string, string, string] = [...prev] as [string, string, string]
                        next[i] = e.target.value
                        return next
                      })
                    }
                    className={`w-full border rounded px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#1A4D52]/40 ${
                      step4Attempted && checkInputs[i].trim().toLowerCase() !== phrase[idx]?.toLowerCase()
                        ? 'border-red-400 bg-red-50'
                        : ''
                    }`}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                  {step4Attempted && checkInputs[i].trim().toLowerCase() !== phrase[idx]?.toLowerCase() && (
                    <p className="text-xs text-red-600">Parola non corretta</p>
                  )}
                </div>
              ))}
            </div>

            {step4Attempted && !step4Valid && (
              <p className="text-sm text-red-600 text-center">
                Alcune parole non corrispondono. Torna indietro per ricontrollare la tua recovery phrase.
              </p>
            )}

            <Button
              className="w-full bg-[#1A4D52] hover:bg-[#1A4D52]/90 text-white"
              onClick={() => {
                setStep4Attempted(true)
                if (step4Valid) handleActivate()
              }}
            >
              Attiva sync
            </Button>

            <button
              onClick={() => {
                setStep4Attempted(false)
                setCheckInputs(['', '', ''])
                setStep(3)
              }}
              className="w-full text-sm text-gray-400 hover:text-gray-600 underline"
            >
              ← Torna alla recovery phrase
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
