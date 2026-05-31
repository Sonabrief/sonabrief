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

// Additional Authenticated Data (AAD): costante versionata, non segreta.
// Lega ogni ciphertext al contesto applicativo "sync archive v1" così un blob
// non è riutilizzabile in un contesto diverso e abbiamo un punto di estensione
// futuro. Deve essere identica in encrypt e decrypt o l'autenticazione fallisce.
const SYNC_AAD = sodium.from_string('sonabrief-sync-v1')

export function encrypt(
  plaintext: string,
  key: Uint8Array,
): { ciphertext: Uint8Array; nonce: Uint8Array } {
  const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES)
  const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    plaintext,
    SYNC_AAD,
    null,
    nonce,
    key,
  )
  return { ciphertext, nonce }
}

export function decrypt(ciphertext: Uint8Array, nonce: Uint8Array, key: Uint8Array): string {
  try {
    const plaintext = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      ciphertext,
      SYNC_AAD,
      nonce,
      key,
    )
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
