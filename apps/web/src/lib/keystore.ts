import _sodium from 'libsodium-wrappers-sumo'
await _sodium.ready
const sodium = _sodium

import { deriveKey, recoveryPhraseToKey } from './crypto'

const SESSION_KEY = 'sb_session_key_'

let currentKey: Uint8Array | null = null

export async function unlockWithPassphrase(passphrase: string, salt: Uint8Array): Promise<void> {
  await sodium.ready
  const newKey = await deriveKey(passphrase, salt)
  if (currentKey) sodium.memzero(currentKey)
  currentKey = newKey
}

export function unlockWithRecoveryPhrase(phrase: string[]): void {
  const newKey = recoveryPhraseToKey(phrase)
  if (currentKey) sodium.memzero(currentKey)
  currentKey = newKey
}

export function getCurrentKey(): Uint8Array | null {
  return currentKey
}

export function isUnlocked(): boolean {
  return currentKey !== null
}

export function lock(): void {
  if (currentKey) {
    sodium.memzero(currentKey)
    currentKey = null
  }
}

export async function persistKeyToSession(): Promise<void> {
  if (!currentKey) throw new Error('No key to persist: vault is locked')
  await sodium.ready
  const encoded = sodium.to_base64(currentKey, sodium.base64_variants.ORIGINAL)
  sessionStorage.setItem(SESSION_KEY, encoded)
}

export async function restoreKeyFromSession(): Promise<boolean> {
  const encoded = sessionStorage.getItem(SESSION_KEY)
  if (!encoded) return false
  await sodium.ready
  const newKey = sodium.from_base64(encoded, sodium.base64_variants.ORIGINAL)
  if (currentKey) sodium.memzero(currentKey)
  currentKey = newKey
  return true
}

export function clearSessionKey(): void {
  sessionStorage.removeItem(SESSION_KEY)
}
