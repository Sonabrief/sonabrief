/**
 * Rileva se il browser è in modalità privata/incognito.
 * Non è rilevabile al 100% su tutti i browser, ma copre i casi critici.
 */

export async function isPrivateMode(): Promise<boolean> {
  // Metodo 1: Safari Private — IndexedDB quota è 0
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    try {
      const { quota } = await navigator.storage.estimate()
      if (quota !== undefined && quota < 120 * 1024 * 1024) {
        // Meno di 120MB = quasi certamente Safari Private (quota normale è >1GB)
        return true
      }
    } catch {
      return true
    }
  }

  // Metodo 2: tentativo di scrittura IndexedDB (fallisce su Safari Private)
  return new Promise((resolve) => {
    const test = indexedDB.open('__private_test__')
    test.onerror = () => resolve(true)
    test.onsuccess = () => {
      test.result.close()
      indexedDB.deleteDatabase('__private_test__')
      resolve(false)
    }
  })
}
