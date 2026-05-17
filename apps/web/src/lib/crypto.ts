import _sodium from 'libsodium-wrappers-sumo'
await _sodium.ready
const sodium = _sodium

import * as bip39 from 'bip39'

export async function initCrypto(): Promise<void> {
  await sodium.ready
}

export async function deriveKey(passphrase: string, salt: Uint8Array): Promise<Uint8Array> {
  await sodium.ready
  return sodium.crypto_pwhash(
    32,
    passphrase,
    salt,
    sodium.crypto_pwhash_OPSLIMIT_MODERATE,
    sodium.crypto_pwhash_MEMLIMIT_MODERATE,
    sodium.crypto_pwhash_ALG_ARGON2ID13,
  )
}

// Le funzioni sotto assumono che initCrypto() sia già stata chiamata.

export function generateSalt(): Uint8Array {
  return sodium.randombytes_buf(16)
}

export function encrypt(
  plaintext: string,
  key: Uint8Array,
): { ciphertext: Uint8Array; nonce: Uint8Array } {
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES)
  const ciphertext = sodium.crypto_secretbox_easy(plaintext, nonce, key)
  return { ciphertext, nonce }
}

export function decrypt(ciphertext: Uint8Array, nonce: Uint8Array, key: Uint8Array): string {
  try {
    const plaintext = sodium.crypto_secretbox_open_easy(ciphertext, nonce, key)
    return sodium.to_string(plaintext)
  } catch {
    throw new Error('Decryption failed: invalid key or corrupted data')
  }
}

export function generateRecoveryPhrase(): string[] {
  return bip39.generateMnemonic(128).split(' ')
}

export function recoveryPhraseToKey(phrase: string[]): Uint8Array {
  const seed = bip39.mnemonicToSeedSync(phrase.join(' '))
  return new Uint8Array(seed.buffer, seed.byteOffset, 32)
}
