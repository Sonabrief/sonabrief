import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { KeyRound } from 'lucide-react'
import { API_URL } from '../config'
import { isWebAuthnSupported, loginWithPasskey } from '../lib/webauthn'

export default function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [passkeyLoading, setPasskeyLoading] = useState(false)
  const passkeySupported = isWebAuthnSupported()

  async function handlePasskeyLogin() {
    setPasskeyLoading(true); setError(null)
    try {
      await loginWithPasskey()
      navigate('/dashboard', { replace: true })
    } catch (err) {
      console.error('[passkey login]', err)
      const name = (err as Error & { name?: string })?.name
      if (name === 'NotAllowedError') setError('Operazione annullata')
      else setError('Passkey non riconosciuta. Prova con email.')
    } finally {
      setPasskeyLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/auth/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          screen_resolution: `${window.screen.width}x${window.screen.height}`,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        if (data.error === 'disposable_email') {
          setError('Usa un indirizzo email reale: le email temporanee non sono accettate.')
        } else if (data.error === 'rate_limited') {
          setError('Troppi tentativi. Riprova tra qualche ora.')
        } else if (data.error === 'datacenter_ip_blocked') {
          setError('Registrazione non disponibile da questa rete.')
        } else {
          setError('Errore durante l\'invio. Riprova tra poco.')
        }
        setLoading(false)
        return
      }
      setSent(true)
    } catch {
      setError('Errore di rete. Controlla la connessione e riprova.')
    }
    setLoading(false)
  }

  if (sent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm text-center">
          <img src="/logo.svg" alt="Sonabrief" className="mx-auto mb-10 h-7 w-auto" />
          <h1 className="font-heading text-[clamp(1.875rem,4vw,3rem)] font-extrabold leading-[1.1] tracking-[-0.02em] text-foreground">
            Controlla la tua email
          </h1>
          <p className="mt-4 text-sm text-muted-foreground">
            Abbiamo inviato un link di accesso a:
          </p>
          <p className="mt-1 text-sm font-semibold text-foreground">{email}</p>
          <p className="mt-4 text-sm text-muted-foreground">
            Il link è valido per 15 minuti. Controlla anche lo spam.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <img src="/logo.svg" alt="Sonabrief" className="mb-10 h-7 w-auto" />

        <h1 className="mb-6 font-heading text-[clamp(1.875rem,4vw,3rem)] font-extrabold leading-[1.1] tracking-[-0.02em] text-foreground">
          Accedi a Sonabrief
        </h1>

        {passkeySupported && (
          <>
            <button
              type="button"
              onClick={handlePasskeyLogin}
              disabled={passkeyLoading}
              aria-busy={passkeyLoading}
              className="mb-4 flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-(--primary-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50 motion-reduce:transition-none"
            >
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              {passkeyLoading ? 'Verifica in corso…' : 'Accedi con passkey'}
            </button>

            <div className="my-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs uppercase tracking-widest text-muted-foreground">oppure</span>
              <div className="h-px flex-1 bg-border" />
            </div>
          </>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div>
            <label
              htmlFor="email"
              className="mb-1.5 block text-sm font-medium text-foreground"
            >
              Indirizzo email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="nome@esempio.it"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
            />
            {error && (
              <p role="alert" className="mt-2 text-sm text-destructive">
                {error}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            aria-busy={loading}
            className="mt-4 w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-(--primary-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50 motion-reduce:transition-none"
          >
            {loading ? 'Invio in corso...' : 'Invia link di accesso'}
          </button>
        </form>
      </div>
    </div>
  )
}
