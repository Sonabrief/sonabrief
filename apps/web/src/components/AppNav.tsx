import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { getMe, logout } from '../lib/api'

const NAV_ITEMS = [
  { label: 'Archivio', path: '/archive' },
  { label: 'Calendario', path: '/calendar' },
  { label: 'Azioni', path: '/actions' },
  { label: 'Clienti', path: '/clients' },
  { label: 'Template', path: '/templates' },
]

export function AppNav() {
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')

  useEffect(() => {
    getMe().then(user => { if (user) setEmail(user.email) })
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

        <ul className="hidden items-center gap-0.5 md:flex" role="list">
          {NAV_ITEMS.map(({ label, path }) => (
            <li key={path}>
              <button
                onClick={() => navigate(path)}
                aria-current={location.pathname === path ? 'page' : undefined}
                className={`rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none ${
                  location.pathname === path
                    ? 'bg-secondary text-primary'
                    : 'text-foreground hover:bg-border'
                }`}
              >
                {label}
              </button>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-5">
          {email && (
            <span className="hidden max-w-[200px] truncate text-xs text-muted-foreground md:block">
              {email}
            </span>
          )}
          <button
            onClick={handleLogout}
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground motion-reduce:transition-none"
          >
            Esci
          </button>
        </div>
      </div>
    </nav>
  )
}
