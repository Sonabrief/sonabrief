import { useTier } from '../hooks/useTier'

interface ProGateProps {
  children: React.ReactNode
  feature?: string
}

export function ProGate({ children, feature = 'Questa funzione' }: ProGateProps) {
  const { isFree, loading } = useTier()

  if (loading) return <>{children}</>

  if (isFree) {
    return (
      <div className="relative">
        <div className="pointer-events-none opacity-40 select-none">
          {children}
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="bg-card border border-border rounded-lg p-4 shadow-lg text-center max-w-xs">
            <p className="font-heading text-sm font-semibold text-foreground mb-1">
              {feature} è disponibile con Pro
            </p>
            <p className="text-xs text-muted-foreground mb-3">
              Passa a Pro per sbloccare tutte le funzioni.
            </p>
            
              href="/pricing"
              className="inline-block bg-[#1A4D52] text-white text-xs font-medium px-4 py-2 rounded-md hover:opacity-90 transition-opacity"
            >
              Vedi i piani
            </a>
          </div>
        </div>
      </div>
    )
  }

  return <>{children}</>
}