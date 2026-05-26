import { useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { CheckCircle, Download, Cpu, AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useOllamaSetup, MODELS, type ModelKey } from './useOllamaSetup'

interface Props {
  onComplete: () => void
  onCancel: () => void
  onBack?: () => void
  autoDetect?: boolean
}

const fade = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.2 },
}

export function OllamaSetupFlow({ onComplete, onCancel, onBack, autoDetect = true }: Props) {
  const { t } = useTranslation()
  const setup = useOllamaSetup({ autoDetect })

  // Pre-select suggested model on mount / when model-select step activates
  useEffect(() => {
    if (setup.step === 'model-select') {
      setup.selectModel(setup.suggestedModel)
    }
  }, [setup.step]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex min-h-100 flex-col items-center justify-center px-4 py-8">
      {onBack && (
        <div className="absolute top-4 left-4">
          <button
            type="button"
            onClick={onBack}
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {t('ollama.back_to_standard')}
          </button>
        </div>
      )}
      <AnimatePresence mode="wait">
        {setup.step === 'detecting' && (
          <motion.div key="detecting" {...fade} className="flex flex-col items-center gap-4">
            <div className="size-10 animate-spin rounded-full border-3 border-border border-t-primary" />
            <p className="text-sm text-muted-foreground">{t('ollama.detecting')}</p>
          </motion.div>
        )}

        {setup.step === 'not-found' && (
          <motion.div key="not-found" {...fade} className="w-full max-w-md space-y-6">
            <div className="text-center">
              <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-primary/10">
                <Cpu className="size-6 text-primary" />
              </div>
              <h2 className="font-heading text-xl font-semibold text-foreground">
                {t('ollama.not_found_title')}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('ollama.not_found_desc')}
              </p>
            </div>

            <ol className="space-y-3">
              {([
                {
                  n: 1,
                  title: t('ollama.step_download_title'),
                  content: (
                    <a
                      href="https://ollama.com/download"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                    >
                      <Download className="size-3.5" />
                      {t('ollama.step_download_btn')}
                    </a>
                  ),
                },
                {
                  n: 2,
                  title: t('ollama.step_install_title'),
                  content: (
                    <p className="text-sm text-muted-foreground">
                      {t('ollama.step_install_desc')}
                    </p>
                  ),
                },
                {
                  n: 3,
                  title: t('ollama.step_return_title'),
                  content: (
                    <p className="text-sm text-muted-foreground">
                      {t('ollama.step_return_desc')}
                    </p>
                  ),
                },
                {
                  n: 4,
                  title: t('ollama.step_start_title'),
                  content: (
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">
                        {t('ollama.step_start_desc_before')}{' '}
                        <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">ollama serve</code>{' '}
                        {t('ollama.step_start_desc_after')}
                      </p>
                      <button
                        onClick={setup.retry}
                        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
                      >
                        {t('ollama.started_btn')}
                      </button>
                    </div>
                  ),
                },
              ] as const).map(({ n, title, content }) => (
                <li key={n} className="flex gap-4 rounded-xl border border-border bg-card p-4">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {n}
                  </span>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">{title}</p>
                    {content}
                  </div>
                </li>
              ))}
            </ol>

            <div className="flex items-center justify-between">
              <a
                href="https://ollama.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                {t('ollama.what_is')}
              </a>
              <button
                onClick={onCancel}
                className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                {t('ollama.cancel')}
              </button>
            </div>
          </motion.div>
        )}

        {setup.step === 'model-select' && (
          <motion.div key="model-select" {...fade} className="w-full max-w-md space-y-5">
            <div className="text-center">
              <h2 className="font-heading text-xl font-semibold text-foreground">
                {t('ollama.model_select_title')}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('ollama.model_select_desc')}
              </p>
            </div>

            <div className="space-y-2">
              {(Object.entries(MODELS) as [ModelKey, typeof MODELS[ModelKey]][]).map(
                ([key, model]) => {
                  const isSelected = setup.selectedModel === key
                  const isSuggested = setup.suggestedModel === key
                  return (
                    <button
                      key={key}
                      onClick={() => setup.selectModel(key)}
                      className={[
                        'w-full rounded-xl border p-4 text-left transition-all',
                        isSelected
                          ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                          : 'border-border bg-card hover:border-primary/40 hover:bg-muted/50',
                      ].join(' ')}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-foreground">
                          {t(`ollama.model_${key}_label` as const)}
                        </span>
                        {isSuggested && (
                          <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                            {t('ollama.suggested')}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        <span>{model.sizeGB} GB download</span>
                        <span>·</span>
                        <span>{model.ramGB} GB RAM</span>
                      </div>
                      <p className="mt-1.5 text-xs text-muted-foreground">{t(`ollama.model_${key}_desc` as const)}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground/70">{t(`ollama.model_${key}_compatible` as const)}</p>
                    </button>
                  )
                }
              )}
            </div>

            <button
              onClick={setup.startDownload}
              disabled={!setup.selectedModel}
              className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t('ollama.download_start_btn')}
            </button>
          </motion.div>
        )}

        {setup.step === 'downloading' && (
          <motion.div key="downloading" {...fade} className="w-full max-w-sm space-y-6 text-center">
            <div>
              <h2 className="font-heading text-xl font-semibold text-foreground">
                {t('ollama.downloading_title')}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t(`ollama.model_${setup.selectedModel}_label` as const)} · {MODELS[setup.selectedModel].sizeGB} GB
              </p>
            </div>

            <div className="space-y-2">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <motion.div
                  className="h-full rounded-full bg-primary"
                  initial={{ width: '0%' }}
                  animate={{ width: `${setup.downloadProgress}%` }}
                  transition={{ ease: 'easeOut', duration: 0.4 }}
                />
              </div>
              <p className="text-right text-xs font-medium text-primary">
                {setup.downloadProgress}%
              </p>
            </div>

            <p className="text-xs text-muted-foreground">
              {t('ollama.download_first_time')}
            </p>
          </motion.div>
        )}

        {setup.step === 'ready' && (
          <motion.div key="ready" {...fade} className="w-full max-w-sm space-y-6 text-center">
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 20 }}
              className="mx-auto flex size-16 items-center justify-center rounded-full bg-green-100"
            >
              <CheckCircle className="size-8 text-green-600" />
            </motion.div>

            <div>
              <h2 className="font-heading text-xl font-semibold text-foreground">
                {t('ollama.ready_title')}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('ollama.ready_desc')}
              </p>
            </div>

            <button
              onClick={onComplete}
              className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              {t('ollama.start_recording_btn')}
            </button>
          </motion.div>
        )}

        {setup.step === 'error' && (
          <motion.div key="error" {...fade} className="w-full max-w-sm space-y-6 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="size-6 text-destructive" />
            </div>

            <div>
              <h2 className="font-heading text-base font-semibold text-foreground">
                {t('ollama.error_title')}
              </h2>
              {setup.errorMessage && (
                <p className="mt-1 text-xs text-muted-foreground">{setup.errorMessage}</p>
              )}
            </div>

            <button
              onClick={setup.retry}
              className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              {t('ollama.retry')}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
