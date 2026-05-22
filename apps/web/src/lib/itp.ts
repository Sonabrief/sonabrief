/**
 * ITP (Intelligent Tracking Prevention) detection e mitigazione.
 * Safari cancella IndexedDB dopo 7 giorni senza interazione.
 */

/** Rileva Safari (incluso iOS Chrome/Firefox che usano WebKit sotto) */
export function isSafariBrowser(): boolean {
  const ua = navigator.userAgent
  const isWebKit = /WebKit/.test(ua)
  const isChrome = /Chrome/.test(ua)
  const isFirefoxNonSafari = /Firefox/.test(ua) && !/Safari/.test(ua)
  return isWebKit && !isChrome && !isFirefoxNonSafari
}

/** Controlla se lo storage è già persistente */
export async function isStoragePersisted(): Promise<boolean> {
  if (!navigator.storage?.persisted) return false
  return navigator.storage.persisted()
}

/**
 * Richiede storage persistente al browser.
 * Su Safari non ha effetto ma non genera errori.
 * Su Chrome mostra un prompt se il sito non è bookmarkato/installato.
 * Ritorna true se concesso, false altrimenti.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  try {
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

/**
 * Logica completa da chiamare al boot dell'app (dopo login).
 * Ritorna lo stato corrente per mostrare UI appropriata.
 */
export async function checkAndRequestPersistence(): Promise<{
  isSafari: boolean
  isPersisted: boolean
  wasRequested: boolean
}> {
  const isSafari = isSafariBrowser()
  const alreadyPersisted = await isStoragePersisted()

  if (alreadyPersisted) {
    return { isSafari, isPersisted: true, wasRequested: false }
  }

  const granted = await requestPersistentStorage()
  return { isSafari, isPersisted: granted, wasRequested: true }
}
