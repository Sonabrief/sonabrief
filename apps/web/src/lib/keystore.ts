import _sodium from 'libsodium-wrappers-sumo'
await _sodium.ready
const sodium = _sodium

import { unwrapWithPassphrase, unwrapWithRecovery, type SerializedKeyring } from './keyring'

const SESSION_KEY = 'sb_session_key_'

// La chiave tenuta in memoria è la DEK (Data Encryption Key): cifra l'archivio.
// passphrase e recovery phrase non producono più una chiave direttamente —
// scartano la DEK dal keyring (vedi keyring.ts).
let currentDEK: Uint8Array | null = null

/** Errore lanciato quando passphrase o recovery phrase non aprono il keyring. */
export class InvalidUnlockSecretError extends Error {
  constructor() {
    super('invalid_unlock_secret')
    this.name = 'InvalidUnlockSecretError'
  }
}

function setDEK(dek: Uint8Array): void {
  if (currentDEK) sodium.memzero(currentDEK)
  currentDEK = dek
}

/** Sblocca la sessione con la passphrase, scartando la DEK dal keyring. */
export async function unlockWithPassphrase(passphrase: string, keyring: SerializedKeyring): Promise<void> {
  await sodium.ready
  try {
    setDEK(await unwrapWithPassphrase(keyring, passphrase))
  } catch {
    throw new InvalidUnlockSecretError()
  }
}

/** Sblocca la sessione con la recovery phrase, scartando la DEK dal keyring. */
export async function unlockWithRecoveryPhrase(phrase: string[], keyring: SerializedKeyring): Promise<void> {
  await sodium.ready
  try {
    setDEK(await unwrapWithRecovery(keyring, phrase))
  } catch {
    throw new InvalidUnlockSecretError()
  }
}

/** Sblocca direttamente con una DEK già nota (es. subito dopo createKeyring in onboarding). */
export function unlockWithDEK(dek: Uint8Array): void {
  setDEK(dek.slice())
}

/** Ritorna la DEK corrente (chiave di cifratura archivio) o null se la sessione è bloccata. */
export function getCurrentKey(): Uint8Array | null {
  return currentDEK
}

export function isUnlocked(): boolean {
  return currentDEK !== null
}

export function lock(): void {
  if (currentDEK) {
    sodium.memzero(currentDEK)
    currentDEK = null
  }
}

export async function persistKeyToSession(): Promise<void> {
  if (!currentDEK) throw new Error('No key to persist: vault is locked')
  await sodium.ready
  const encoded = sodium.to_base64(currentDEK, sodium.base64_variants.ORIGINAL)
  sessionStorage.setItem(SESSION_KEY, encoded)
}

export async function restoreKeyFromSession(): Promise<boolean> {
  const encoded = sessionStorage.getItem(SESSION_KEY)
  if (!encoded) return false
  await sodium.ready
  setDEK(sodium.from_base64(encoded, sodium.base64_variants.ORIGINAL))
  return true
}

export function clearSessionKey(): void {
  sessionStorage.removeItem(SESSION_KEY)
}
