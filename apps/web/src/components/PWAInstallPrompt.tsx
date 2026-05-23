import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Download, X } from 'lucide-react';

const DISMISSED_KEY = 'pwa_install_dismissed';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    if (localStorage.getItem(DISMISSED_KEY)) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      localStorage.setItem(DISMISSED_KEY, '1');
    }
    setVisible(false);
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1');
    setVisible(false);
    setDeferredPrompt(null);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', damping: 20 }}
          className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-sm"
        >
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-lg">
            <img src="/icons/icon-192.png" alt="Sonabrief" className="h-10 w-10 rounded-xl" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Installa Sonabrief</p>
              <p className="text-xs text-muted-foreground">Accesso rapido dalla schermata home</p>
            </div>
            <button
              onClick={handleInstall}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
            >
              <Download className="h-3.5 w-3.5" />
              Installa
            </button>
            <button onClick={handleDismiss} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
