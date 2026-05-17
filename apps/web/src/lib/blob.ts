import { encrypt, decrypt } from './crypto'

const MAGIC = new Uint8Array([83, 66, 66, 49]) // 'SBB1'
const VERSION = 1
const SALT_SIZE = 16
const NONCE_SIZE = 24
const HEADER_SIZE = 45 // 4 magic + 1 version + 16 salt + 24 nonce

export function serializeBlob(
  ciphertext: Uint8Array,
  nonce: Uint8Array,
  salt: Uint8Array,
): Uint8Array {
  if (nonce.length !== NONCE_SIZE)
    throw new Error(`nonce deve essere ${NONCE_SIZE} byte, ricevuto ${nonce.length}`)
  if (salt.length !== SALT_SIZE)
    throw new Error(`salt deve essere ${SALT_SIZE} byte, ricevuto ${salt.length}`)

  const blob = new Uint8Array(HEADER_SIZE + ciphertext.length)
  blob.set(MAGIC, 0)
  blob[4] = VERSION
  blob.set(salt, 5)
  blob.set(nonce, 21)
  blob.set(ciphertext, 45)
  return blob
}

export function deserializeBlob(blob: Uint8Array): {
  version: number
  salt: Uint8Array
  nonce: Uint8Array
  ciphertext: Uint8Array
} {
  if (blob.length < HEADER_SIZE)
    throw new Error(`Blob troppo corto: ${blob.length} byte (minimo ${HEADER_SIZE})`)

  for (let i = 0; i < 4; i++) {
    if (blob[i] !== MAGIC[i])
      throw new Error('Magic number non valido: il file non è un blob .sbb')
  }

  const version = blob[4]
  if (version !== 1)
    throw new Error(`Versione blob non supportata: ${version}`)

  return {
    version,
    salt: blob.slice(5, 21),
    nonce: blob.slice(21, 45),
    ciphertext: blob.slice(45),
  }
}

export function encryptMeeting(meeting: object, key: Uint8Array, salt: Uint8Array): Uint8Array {
  const { ciphertext, nonce } = encrypt(JSON.stringify(meeting), key)
  return serializeBlob(ciphertext, nonce, salt)
}

export function decryptMeeting(blob: Uint8Array, key: Uint8Array): object {
  const { ciphertext, nonce } = deserializeBlob(blob)
  return JSON.parse(decrypt(ciphertext, nonce, key)) as object
}
