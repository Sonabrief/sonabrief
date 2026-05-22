import { EyeOff } from 'lucide-react'

export function PrivateModeWarning() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
      <img src="/logo.svg" alt="Sonabrief" className="mb-10 h-7 w-auto" />
      <EyeOff className="mb-6 h-12 w-12 text-muted-foreground" aria-hidden="true" />
      <h1 className="font-heading text-[clamp(1.5rem,3.5vw,2.25rem)] font-extrabold leading-[1.1] tracking-[-0.02em] text-foreground">
        Sonabrief non funziona in modalità privata
      </h1>
      <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
        Le finestre private bloccano il database locale che Sonabrief usa per proteggere le tue trascrizioni. Apri Sonabrief in una finestra normale per continuare.
      </p>
    </div>
  )
}
