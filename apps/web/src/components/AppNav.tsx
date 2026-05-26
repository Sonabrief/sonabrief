import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronDown, LogOut, Menu, User, X } from 'lucide-react'
import { getMe, getBillingStatus, logout } from '../lib/api'

const NAV_ITEMS = [
  { label: 'Archivio', path: '/archive', proOnly: false },
  { label: 'Calendario', path: '/calendar', proOnly: true },
  { label: 'Azioni', path: '/actions', proOnly: true },
  { label: 'Clienti', path: '/clients', proOnly: true },
  { label: 'Template', path: '/templates', proOnly: false },
]

function getInitials(email: string): string {
  const parts = email.split('@')[0].split(/[._-]/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return email.slice(0, 2).toUpperCase()
}

function TierBadge({ tier }: { tier: string }) {
  if (tier === 'unlimited') {
    return (
      <span
        className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
        style={{ background: '#F5EFE4', color: '#7A5C30' }}
      >
        Pro Unlimited
      </span>
    )
  }
  if (tier === 'pro') {
    return (
      <span className="inline-flex items-center rounded-full border border-border bg-card px-2 py-0.5 text-[10px] font-medium text-primary">
        Pro
      </span>
    )
  }
  return null
}

function UserMenu({
  displayName,
  email,
  tier,
  onLogout,
}: {
  displayName: string | null
  email: string
  tier: string
  onLogout: () => void
}) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  const visibleName = displayName ?? email.split('@')[0]

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex cursor-pointer items-center gap-2 rounded-full px-2.5 py-1 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
      >
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1a5c5c] text-xs font-semibold text-white"
          aria-hidden="true"
        >
          {getInitials(email)}
        </span>
        <span className="hidden max-w-32 truncate text-sm font-medium text-foreground md:block">
          {visibleName}
        </span>
        <ChevronDown
          className={`hidden h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none md:block ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
            className="absolute right-0 top-full z-20 mt-2 min-w-55 rounded-xl border border-border bg-card shadow-lg shadow-black/5"
          >
            {/* Header — non cliccabile */}
            <div className="border-b border-border px-4 py-3">
              <p className="text-sm font-medium text-foreground">{visibleName}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{email}</p>
              {tier !== 'free' && (
                <div className="mt-1.5">
                  <TierBadge tier={tier} />
                </div>
              )}
            </div>

            {/* Voci */}
            <div className="py-1">
              <button
                role="menuitem"
                onClick={() => { setOpen(false); navigate('/profile') }}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-foreground transition-colors hover:bg-muted motion-reduce:transition-none"
              >
                <User className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                Il tuo profilo
              </button>

              <div className="border-t border-border" />

              <button
                role="menuitem"
                onClick={() => { setOpen(false); onLogout() }}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-destructive transition-colors hover:bg-destructive/5 motion-reduce:transition-none"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Esci
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function AppNav() {
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [tier, setTier] = useState('free')
  const [isFree, setIsFree] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    getMe().then(user => {
      if (user) {
        setEmail(user.email)
        setDisplayName(user.display_name)
      }
    })
    getBillingStatus().then(status => {
      const t = status?.tier ?? 'free'
      setTier(t)
      setIsFree(t === 'free')
    })
  }, [])

  async function handleLogout() {
    await logout()
    navigate('/', { replace: true })
  }

  return (
    <nav
      className="sticky top-0 z-10 border-b border-border bg-card"
      aria-label="Navigazione principale"
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-8 px-6">
        <button
          onClick={() => navigate('/dashboard')}
          className="shrink-0 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="Torna alla dashboard"
        >
          <img src="/logo.svg" alt="Sonabrief" className="h-7 w-auto" />
        </button>

        <button
          className="flex items-center justify-center rounded-md p-2 text-foreground hover:bg-muted md:hidden"
          onClick={() => setMobileOpen(o => !o)}
          aria-label={mobileOpen ? 'Chiudi menu' : 'Apri menu'}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        <ul className="hidden items-center gap-0.5 md:flex" role="list">
          {NAV_ITEMS.map(({ label, path, proOnly }) => {
            const locked = proOnly && isFree
            return (
              <li key={path}>
                <button
                  onClick={() => navigate(path)}
                  aria-current={location.pathname === path ? 'page' : undefined}
                  title={locked ? `${label} è disponibile con Pro` : undefined}
                  className={`relative rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none ${
                    location.pathname === path
                      ? 'text-primary after:absolute after:bottom-0 after:left-3 after:right-3 after:h-0.5 after:rounded-full after:bg-primary'
                      : locked
                      ? 'text-muted-foreground/50 hover:bg-border'
                      : 'text-foreground hover:bg-border'
                  }`}
                >
                  {label}
                  {locked && (
                    <span className="ml-1 text-[10px] text-muted-foreground/50">✦</span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>

        <div className="ml-auto flex items-center gap-5">
          {email && (
            <UserMenu
              displayName={displayName}
              email={email}
              tier={tier}
              onLogout={handleLogout}
            />
          )}
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden border-t border-border bg-card md:hidden"
          >
            <ul className="flex flex-col px-4 py-2" role="list">
              {NAV_ITEMS.map(({ label, path, proOnly }) => {
                const locked = proOnly && isFree
                return (
                  <li key={path}>
                    <button
                      onClick={() => { setMobileOpen(false); navigate(path) }}
                      aria-current={location.pathname === path ? 'page' : undefined}
                      className={`flex w-full items-center rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                        location.pathname === path
                          ? 'bg-secondary text-primary'
                          : locked
                          ? 'text-muted-foreground/50'
                          : 'text-foreground hover:bg-muted'
                      }`}
                    >
                      {label}
                      {locked && <span className="ml-1 text-[10px] text-muted-foreground/50">✦</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  )
}
