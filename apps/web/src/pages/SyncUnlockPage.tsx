import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { unlockWithPassphrase, unlockWithRecoveryPhrase, persistKeyToSession, InvalidUnlockSecretError } from '../lib/keystore'
import { fetchKeyring } from '../lib/keyring'
import { Button } from '../components/ui/button'

export default function SyncUnlockPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [passphrase, setPassphrase] = useState('')
  const [passphraseError, setPassphraseError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [showRecovery, setShowRecovery] = useState(false)
  const [recoveryWords, setRecoveryWords] = useState<string[]>(Array(12).fill(''))
  const [recoveryError, setRecoveryError] = useState('')
  const [recoverySubmitting, setRecoverySubmitting] = useState(false)

  async function handleUnlock() {
    if (!passphrase) return
    setSubmitting(true)
    setPassphraseError('')
    try {
      const keyring = await fetchKeyring()
      if (!keyring) throw new Error('keyring_not_found')
      // unlockWithPassphrase lancia InvalidUnlockSecretError se la passphrase è errata
      await unlockWithPassphrase(passphrase, keyring)
      await persistKeyToSession()
      navigate('/dashboard')
    } catch (err) {
      setPassphraseError(
        err instanceof InvalidUnlockSecretError
          ? t('sync_unlock.error_wrong')
          : t('sync_unlock.error_generic'),
      )
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRecoveryUnlock() {
    setRecoverySubmitting(true)
    setRecoveryError('')
    try {
      const keyring = await fetchKeyring()
      if (!keyring) throw new Error('keyring_not_found')
      await unlockWithRecoveryPhrase(recoveryWords, keyring)
      await persistKeyToSession()
      navigate('/dashboard')
    } catch (err) {
      setRecoveryError(
        err instanceof InvalidUnlockSecretError
          ? t('sync_unlock.error_invalid_recovery')
          : t('sync_unlock.error_generic'),
      )
    } finally {
      setRecoverySubmitting(false)
    }
  }

  function updateWord(i: number, value: string) {
    setRecoveryWords(prev => {
      const next = [...prev]
      next[i] = value.trim()
      return next
    })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="w-full max-w-sm py-12 space-y-6">
        {!showRecovery ? (
          <>
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold text-[#1A4D52]">
                {t('sync_unlock.title')}
              </h1>
              <p className="text-sm text-gray-500">
                {t('sync_unlock.hint')}
              </p>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">{t('sync_unlock.passphrase_label')}</label>
              <input
                type="password"
                value={passphrase}
                onChange={e => setPassphrase(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleUnlock() }}
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A4D52]/40"
                autoFocus
              />
              {passphraseError && (
                <p className="text-xs text-red-600">{passphraseError}</p>
              )}
            </div>
            <Button
              className="w-full bg-[#1A4D52] hover:bg-[#1A4D52]/90 text-white"
              onClick={handleUnlock}
              disabled={!passphrase || submitting}
            >
              {submitting ? t('sync_unlock.unlocking') : t('sync_unlock.unlock_btn')}
            </Button>
            <button
              onClick={() => setShowRecovery(true)}
              className="w-full text-center text-sm text-[#1A4D52] underline underline-offset-4"
            >
              {t('sync_unlock.recovery_link')}
            </button>
          </>
        ) : (
          <>
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold text-[#1A4D52]">{t('sync_unlock.recovery_title')}</h1>
              <p className="text-sm text-gray-500">
                {t('sync_unlock.recovery_hint')}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {recoveryWords.map((word, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="w-5 shrink-0 text-right font-mono text-xs text-gray-400">
                    {i + 1}.
                  </span>
                  <input
                    type="text"
                    value={word}
                    onChange={e => updateWord(i, e.target.value)}
                    className="min-w-0 flex-1 rounded border px-2 py-1 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#1A4D52]/40"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </div>
              ))}
            </div>
            {recoveryError && (
              <p className="text-xs text-red-600">{recoveryError}</p>
            )}
            <Button
              className="w-full bg-[#1A4D52] hover:bg-[#1A4D52]/90 text-white"
              onClick={handleRecoveryUnlock}
              disabled={recoveryWords.some(w => !w) || recoverySubmitting}
            >
              {recoverySubmitting ? t('sync_unlock.restoring') : t('sync_unlock.restore_btn')}
            </Button>
            <button
              onClick={() => setShowRecovery(false)}
              className="w-full text-center text-sm text-gray-400 underline underline-offset-4"
            >
              {t('sync_unlock.back_to_passphrase')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
