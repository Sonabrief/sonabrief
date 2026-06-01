import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { KeyRound, Mic, Brain, Archive } from 'lucide-react'
import { API_URL } from '../config'
import { isWebAuthnSupported, loginWithPasskey } from '../lib/webauthn'

export default function LoginPage() {
  const { t } = useTranslation()
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
      if (name === 'NotAllowedError') setError(t('login.error_cancelled'))
      else setError(t('login.error_passkey'))
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
          setError(t('login.error_disposable_email'))
        } else if (data.error === 'rate_limited') {
          setError(t('login.error_rate_limited'))
        } else if (data.error === 'datacenter_ip_blocked') {
          setError(t('login.error_datacenter_ip'))
        } else {
          setError(t('login.error_send'))
        }
        setLoading(false)
        return
      }
      setSent(true)
    } catch {
      setError(t('login.error_network'))
    }
    setLoading(false)
  }

  // — Stato: email inviata —
  if (sent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm text-center">
          <img src="/logo.svg" alt="Sonabrief" className="mx-auto mb-10 h-7 w-auto" />
          <h1 className="font-heading text-[clamp(1.875rem,4vw,3rem)] font-extrabold leading-[1.1] tracking-[-0.02em] text-foreground">
            {t('login.check_email_title')}
          </h1>
          <p className="mt-4 text-sm text-muted-foreground">
            {t('login.check_email_hint')}
          </p>
          <p className="mt-1 text-sm font-semibold text-foreground">{email}</p>
          <p className="mt-4 text-sm text-muted-foreground">
            {t('login.link_validity')}
          </p>
        </div>
      </div>
    )
  }

  // — Stato: form principale —
  return (
    <div className="flex min-h-screen">

      {/* Colonna sinistra — pannello brand */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-[#1a5c5c] px-16 py-14">
        <img src="/logo.svg" alt="Sonabrief" className="h-8 w-auto brightness-0 invert" />

        <div>
          <h2 className="font-heading text-[clamp(2rem,3.5vw,2.75rem)] font-extrabold leading-[1.15] tracking-[-0.02em] text-white">
            {t('login.tagline')}
          </h2>

          <ul className="mt-10 space-y-5">
            {([
              { icon: Mic,     key: 'login.feature_transcription' },
              { icon: Brain,   key: 'login.feature_synthesis' },
              { icon: Archive, key: 'login.feature_archive' },
            ] as const).map(({ icon: Icon, key }) => (
              <li key={key} className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10">
                  <Icon className="h-4 w-4 text-white" aria-hidden="true" />
                </span>
                <span className="text-sm text-white/80">{t(key)}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-sm leading-relaxed text-white/50 italic">
          {t('login.feature_privacy')}
        </p>
      </div>

      {/* Colonna destra — form */}
      <div className="flex w-full lg:w-1/2 flex-col items-center justify-center min-h-screen bg-background px-6 py-12">
        {/* Logo visibile solo su mobile */}
        <div className="mb-10 lg:hidden">
          <img src="/logo.svg" alt="Sonabrief" className="h-7 w-auto" />
        </div>

        <div className="w-full max-w-sm">
          <h1 className="font-heading text-[clamp(1.75rem,3vw,2.5rem)] font-extrabold leading-[1.1] tracking-[-0.02em] text-foreground">
            {t('login.start')}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('login.email_hint')}
          </p>

          <div className="mt-8 space-y-4">
            {passkeySupported && (
              <>
                <button
                  type="button"
                  onClick={handlePasskeyLogin}
                  disabled={passkeyLoading}
                  aria-busy={passkeyLoading}
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-(--primary-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50 motion-reduce:transition-none"
                >
                  <KeyRound className="h-4 w-4" aria-hidden="true" />
                  {passkeyLoading ? t('login.verifying') : t('login.passkey_btn')}
                </button>

                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs uppercase tracking-widest text-muted-foreground">{t('login.or')}</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
              </>
            )}

            <form onSubmit={handleSubmit} noValidate className="space-y-3">
              <div>
                <label
                  htmlFor="email"
                  className="mb-1.5 block text-sm font-medium text-foreground"
                >
                  {t('login.email_label')}
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder={t('login.email_placeholder')}
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
                className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-(--primary-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50 motion-reduce:transition-none"
              >
                {loading ? t('login.sending') : t('login.send_link')}
              </button>
            </form>
          </div>

          <p className="mt-8 text-xs text-muted-foreground">
            {t('login.terms_prefix')}{' '}
            <a href="/terms" className="underline underline-offset-2 hover:text-foreground transition-colors">
              {t('login.terms_link')}
            </a>{' '}
            {t('login.terms_connector')}{' '}
            <a href="/privacy" className="underline underline-offset-2 hover:text-foreground transition-colors">
              {t('login.privacy_link')}
            </a>
            .
          </p>
        </div>
      </div>

    </div>
  )
}