import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'motion/react'
import { semanticSearch } from '../lib/semanticSearch'
import { embeddingsService } from '../lib/embeddings'
import { AppNav } from '../components/AppNav'
import i18n from '../i18n'

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(i18n.language, {
    day: 'numeric', month: 'long', year: 'numeric'
  })
}

export default function SearchPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<
    { meetingId: string; title: string; date: number; score: number; preview: string }[]
  >([])
  const [state, setState] = useState<'idle' | 'searching' | 'done' | 'error'>('idle')
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleSearch() {
    if (!query.trim()) return
    setState('searching')
    setResults([])
    embeddingsService.init()
    try {
      const res = await semanticSearch(query.trim(), 8)
      setResults(res)
      setState('done')
    } catch {
      setState('error')
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSearch()
  }

  return (
    <div className="min-h-screen bg-background">
      <AppNav />

      <main className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="mb-8 font-heading text-2xl font-bold tracking-[-0.015em] text-foreground">
          {t('search.title')}
        </h1>

        {/* Search bar */}
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder={t('search.placeholder')}
            aria-label={t('search.aria')}
            className="flex-1 rounded-md border border-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
            autoFocus
          />
          <button
            onClick={handleSearch}
            disabled={state === 'searching' || !query.trim()}
            className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-(--primary-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40 motion-reduce:transition-none"
          >
            {state === 'searching' ? '…' : t('search.btn')}
          </button>
        </div>

        {/* Stati */}
        <div className="mt-6">
          <AnimatePresence mode="wait">
            {state === 'searching' && (
              <motion.p
                key="searching"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="animate-pulse text-sm text-muted-foreground motion-reduce:animate-none"
              >
                {t('search.searching')}
              </motion.p>
            )}

            {state === 'done' && results.length === 0 && (
              <motion.div
                key="empty"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="py-12 text-center"
              >
                <p className="text-sm font-semibold text-foreground">{t('search.no_results')}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t('search.no_results_hint')}
                </p>
              </motion.div>
            )}

            {state === 'error' && (
              <motion.p
                key="error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-sm text-destructive"
              >
                {t('search.error')}
              </motion.p>
            )}

            {results.length > 0 && (
              <motion.div
                key="results"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.18 }}
              >
                <p className="mb-3 text-xs text-muted-foreground">
                  {t('search.results_count', { count: results.length, query })}
                </p>
                <ul className="flex flex-col gap-2" role="list">
                  {results.map((r, i) => (
                    <motion.li
                      key={r.meetingId}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.16, delay: i * 0.04, ease: [0.4, 0, 0.2, 1] }}
                    >
                      <button
                        onClick={() => navigate('/archive')}
                        className="w-full rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary hover:bg-primary/5 motion-reduce:transition-none"
                      >
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-foreground">{r.title}</p>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                              {t('search.match_score', { score: Math.round(r.score * 100) })}
                            </span>
                            <span className="text-xs text-muted-foreground">{formatDate(r.date)}</span>
                          </div>
                        </div>
                        {r.preview && (
                          <p className="line-clamp-2 text-xs text-muted-foreground">{r.preview}</p>
                        )}
                      </button>
                    </motion.li>
                  ))}
                </ul>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  )
}
