import _sodium from 'libsodium-wrappers-sumo'
await _sodium.ready
const sodium = _sodium

import { deriveKey, recoveryPhraseToKey, encrypt, decrypt } from './crypto'

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

export async function saveVerificationBlob(key: Uint8Array): Promise<void> {
  await sodium.ready
  const { ciphertext, nonce } = encrypt('sonabrief-verify-v1', key)
  const blob = {
    ciphertext: sodium.to_base64(ciphertext, sodium.base64_variants.ORIGINAL),
    nonce: sodium.to_base64(nonce, sodium.base64_variants.ORIGINAL),
  }
  localStorage.setItem('sonabrief_verify_blob', JSON.stringify(blob))
}

export async function verifyKey(key: Uint8Array): Promise<boolean> {
  await sodium.ready
  const raw = localStorage.getItem('sonabrief_verify_blob')
  if (!raw) return true // primo accesso, niente da verificare
  try {
    const { ciphertext, nonce } = JSON.parse(raw)
    decrypt(
      sodium.from_base64(ciphertext, sodium.base64_variants.ORIGINAL),
      sodium.from_base64(nonce, sodium.base64_variants.ORIGINAL),
      key,
    )
    return true
  } catch {
    return false
  }
}
