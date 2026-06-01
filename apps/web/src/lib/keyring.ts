import _sodium from 'libsodium-wrappers-sumo'
await _sodium.ready
const sodium = _sodium

import { API_URL } from '../config'
import {
  deriveKey,
  recoveryPhraseToKEK,
  generateSalt,
  generateDEK,
  wrapDEK,
  unwrapDEK,
  type WrappedKey,
} from './crypto'

// Keyring v1 — formato serializzato (tutto base64 ORIGINAL).
// Contiene la DEK avvolta due volte: una con la KEK da passphrase, una con la
// KEK da recovery phrase. Salt distinti per le due derivazioni Argon2id.
export interface SerializedKeyring {
  version: 1
  passphrase: { salt: string; nonce: string; ciphertext: string }
  recovery: { salt: string; nonce: string; ciphertext: string }
}

const b64 = (b: Uint8Array) => sodium.to_base64(b, sodium.base64_variants.ORIGINAL)
const fromB64 = (s: string) => sodium.from_base64(s, sodium.base64_variants.ORIGINAL)

function serializeWrapped(salt: Uint8Array, w: WrappedKey) {
  return { salt: b64(salt), nonce: b64(w.nonce), ciphertext: b64(w.ciphertext) }
}

/**
 * Crea un keyring nuovo in onboarding.
 * CRITICO: la DEK è generata UNA SOLA VOLTA e i due wrap avvolgono la STESSA
 * DEK. Un assert in dev verifica che entrambi gli unwrap riproducano la DEK
 * originale prima di restituire il keyring.
 * Ritorna anche la DEK in chiaro così il caller può sbloccare subito la sessione.
 */
export async function createKeyring(
  passphrase: string,
  recoveryPhrase: string[],
): Promise<{ keyring: SerializedKeyring; dek: Uint8Array }> {
  const dek = generateDEK()

  const passphraseSalt = generateSalt()
  const recoverySalt = generateSalt()

  const passphraseKEK = await deriveKey(passphrase, passphraseSalt)
  const recoveryKEK = await recoveryPhraseToKEK(recoveryPhrase, recoverySalt)

  const passphraseWrapped = wrapDEK(dek, passphraseKEK)
  const recoveryWrapped = wrapDEK(dek, recoveryKEK)

  // Verifica invariante: entrambe le strade scartano la STESSA DEK.
  if (import.meta.env.DEV) {
    const viaPass = unwrapDEK(passphraseWrapped, passphraseKEK)
    const viaRec = unwrapDEK(recoveryWrapped, recoveryKEK)
    const eq = (a: Uint8Array, b: Uint8Array) =>
      a.length === b.length && a.every((v, i) => v === b[i])
    console.assert(eq(viaPass, dek), '[keyring] passphrase unwrap != DEK')
    console.assert(eq(viaRec, dek), '[keyring] recovery unwrap != DEK')
    console.assert(eq(viaPass, viaRec), '[keyring] passphrase/recovery DEK mismatch')
    console.log('[keyring] invariante DEK verificata: passphrase e recovery scartano la stessa DEK')
    sodium.memzero(viaPass)
    sodium.memzero(viaRec)
  }

  sodium.memzero(passphraseKEK)
  sodium.memzero(recoveryKEK)

  const keyring: SerializedKeyring = {
    version: 1,
    passphrase: serializeWrapped(passphraseSalt, passphraseWrapped),
    recovery: serializeWrapped(recoverySalt, recoveryWrapped),
  }

  return { keyring, dek }
}

/** Scarta la DEK dal keyring usando la passphrase. Lancia se la passphrase è errata. */
export async function unwrapWithPassphrase(
  keyring: SerializedKeyring,
  passphrase: string,
): Promise<Uint8Array> {
  const salt = fromB64(keyring.passphrase.salt)
  const kek = await deriveKey(passphrase, salt)
  try {
    return unwrapDEK(
      { nonce: fromB64(keyring.passphrase.nonce), ciphertext: fromB64(keyring.passphrase.ciphertext) },
      kek,
    )
  } finally {
    sodium.memzero(kek)
  }
}

/** Scarta la DEK dal keyring usando la recovery phrase. Lancia se la frase è errata. */
export async function unwrapWithRecovery(
  keyring: SerializedKeyring,
  recoveryPhrase: string[],
): Promise<Uint8Array> {
  const salt = fromB64(keyring.recovery.salt)
  const kek = await recoveryPhraseToKEK(recoveryPhrase, salt)
  try {
    return unwrapDEK(
      { nonce: fromB64(keyring.recovery.nonce), ciphertext: fromB64(keyring.recovery.ciphertext) },
      kek,
    )
  } finally {
    sodium.memzero(kek)
  }
}

// === Persistenza keyring su D1 (autorevole, multi-device) ===

export async function putKeyring(keyring: SerializedKeyring): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/v1/sync/keyring`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyring }),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function fetchKeyring(): Promise<SerializedKeyring | null> {
  try {
    const res = await fetch(`${API_URL}/v1/sync/keyring`, { credentials: 'include' })
    if (!res.ok) return null
    const data = await res.json() as { keyring: SerializedKeyring | null }
    return data.keyring ?? null
  } catch {
    return null
  }
}
