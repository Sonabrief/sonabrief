import { useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { CheckCircle, Download, Cpu, AlertTriangle } from 'lucide-react'
import { useOllamaSetup, MODELS, type ModelKey } from './useOllamaSetup'

interface Props {
  onComplete: () => void
  onCancel: () => void
  autoDetect?: boolean
}

const fade = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.2 },
}

export function OllamaSetupFlow({ onComplete, onCancel, autoDetect = true }: Props) {
  const setup = useOllamaSetup({ autoDetect })

  // Pre-select suggested model on mount / when model-select step activates
  useEffect(() => {
    if (setup.step === 'model-select') {
      setup.selectModel(setup.suggestedModel)
    }
  }, [setup.step]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex min-h-100 flex-col items-center justify-center px-4 py-8">
      <AnimatePresence mode="wait">
        {setup.step === 'detecting' && (
          <motion.div key="detecting" {...fade} className="flex flex-col items-center gap-4">
            <div className="size-10 animate-spin rounded-full border-3 border-border border-t-primary" />
            <p className="text-sm text-muted-foreground">Verifica in corso…</p>
          </motion.div>
        )}

        {setup.step === 'not-found' && (
          <motion.div key="not-found" {...fade} className="w-full max-w-md space-y-6">
            <div className="text-center">
              <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-primary/10">
                <Cpu className="size-6 text-primary" />
              </div>
              <h2 className="font-heading text-xl font-semibold text-foreground">
                Attiva Privacy Engine
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Sonabrief Privacy Engine gira sul tuo computer. Nessun dato esce mai.
              </p>
            </div>

            <ol className="space-y-3">
              {([
                {
                  n: 1,
                  title: 'Scarica Ollama',
                  content: (
                    <a
                      href="https://ollama.com/download"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                    >
                      <Download className="size-3.5" />
                      Scarica
                    </a>
                  ),
                },
                {
                  n: 2,
                  title: 'Installalo',
                  content: (
                    <p className="text-sm text-muted-foreground">
                      Apri il file scaricato e segui le istruzioni. Ci vogliono 2 minuti.
                    </p>
                  ),
                },
                {
                  n: 3,
                  title: 'Torna qui',
                  content: (
                    <p className="text-sm text-muted-foreground">
                      Dopo l'installazione, torna su questa pagina.
                    </p>
                  ),
                },
                {
                  n: 4,
                  title: 'Avvia Ollama',
                  content: (
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">
                        Dopo l'installazione, avvia Ollama come faresti con qualsiasi altra app. Su Mac compare un'icona nella barra menu in alto. Su Windows nell'area di notifica in basso a destra. Su Linux esegui <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">ollama serve</code> nel terminale.
                      </p>
                      <button
                        onClick={setup.retry}
                        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
                      >
                        Ho avviato Ollama
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
                Cos'è Ollama?
              </a>
              <button
                onClick={onCancel}
                className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Annulla
              </button>
            </div>
          </motion.div>
        )}

        {setup.step === 'model-select' && (
          <motion.div key="model-select" {...fade} className="w-full max-w-md space-y-5">
            <div className="text-center">
              <h2 className="font-heading text-xl font-semibold text-foreground">
                Scegli il tuo Privacy Engine
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Gira tutto sul tuo computer. Nessun dato esce mai.
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
                          {model.label}
                        </span>
                        {isSuggested && (
                          <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                            Suggerito per il tuo dispositivo
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        <span>{model.sizeGB} GB download</span>
                        <span>·</span>
                        <span>{model.ramGB} GB RAM</span>
                      </div>
                      <p className="mt-1.5 text-xs text-muted-foreground">{model.description}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground/70">{model.compatible}</p>
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
              Scarica e attiva
            </button>
          </motion.div>
        )}

        {setup.step === 'downloading' && (
          <motion.div key="downloading" {...fade} className="w-full max-w-sm space-y-6 text-center">
            <div>
              <h2 className="font-heading text-xl font-semibold text-foreground">
                Download in corso
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {MODELS[setup.selectedModel].label} · {MODELS[setup.selectedModel].sizeGB} GB
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
              Solo al primo avvio — poi è sempre immediato
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
                Privacy Engine attivo
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Il tuo modello AI è pronto. Tutto gira sul tuo computer.
              </p>
            </div>

            <button
              onClick={onComplete}
              className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Inizia a registrare
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
                Qualcosa è andato storto
              </h2>
              {setup.errorMessage && (
                <p className="mt-1 text-xs text-muted-foreground">{setup.errorMessage}</p>
              )}
            </div>

            <button
              onClick={setup.retry}
              className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Riprova
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
