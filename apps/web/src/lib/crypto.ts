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

// === Envelope encryption (DEK avvolta) ===
//
// Schema: una Data Encryption Key (DEK) casuale cifra l'archivio. La DEK viene
// avvolta (wrapped) due volte — una con la key derivata dalla passphrase, una
// con la key derivata dalla recovery phrase. Entrambe le strade scartano la
// STESSA DEK, quindi passphrase e recovery phrase aprono lo stesso archivio.

const KEYRING_AAD = sodium.from_string('sonabrief-keyring-v1')

/** Genera una DEK casuale a 32 byte (chiave AEAD). */
export function generateDEK(): Uint8Array {
  return sodium.crypto_aead_xchacha20poly1305_ietf_keygen()
}

/**
 * Deriva la KEK (Key Encryption Key) dalla recovery phrase via Argon2id, con
 * salt dedicato. La phrase BIP39 è trattata come una passphrase ad alta
 * entropia — niente troncamento del seed. salt distinto da quello passphrase.
 */
export async function recoveryPhraseToKEK(phrase: string[], salt: Uint8Array): Promise<Uint8Array> {
  return deriveKey(phrase.join(' '), salt)
}

export interface WrappedKey {
  nonce: Uint8Array
  ciphertext: Uint8Array
}

/** Avvolge (cifra) la DEK con una KEK. La KEK non viene mai persistita. */
export function wrapDEK(dek: Uint8Array, kek: Uint8Array): WrappedKey {
  const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES)
  const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    dek,
    KEYRING_AAD,
    null,
    nonce,
    kek,
  )
  return { nonce, ciphertext }
}

/**
 * Scarta (decifra) la DEK da una KEK. Lancia se la KEK è sbagliata: l'AEAD
 * autentica, quindi un unwrap fallito = passphrase/recovery phrase errata.
 * Il caller traduce l'errore in un messaggio utente chiaro.
 */
export function unwrapDEK(wrapped: WrappedKey, kek: Uint8Array): Uint8Array {
  return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null,
    wrapped.ciphertext,
    KEYRING_AAD,
    wrapped.nonce,
    kek,
  )
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
