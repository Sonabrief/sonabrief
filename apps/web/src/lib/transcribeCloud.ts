import { API_URL } from '../config'

export interface CloudTranscribeResult {
  transcript: string
  segments: unknown[]
  minutesUsed: number
  minutesRemaining: number
}

export interface QuotaInfo {
  minutesUsed: number
  minutesIncluded: number
  minutesRemaining: number
  hardCap: number
  extraMinutesPurchased: number
  tier: 'pro' | 'unlimited'
}

export class CloudVeloceNotAvailableError extends Error {
  constructor(message = 'Cloud Veloce richiede piano Pro') {
    super(message)
    this.name = 'CloudVeloceNotAvailableError'
  }
}

export class CloudVeloceQuotaError extends Error {
  constructor(message = 'Quota Cloud Veloce esaurita') {
    super(message)
    this.name = 'CloudVeloceQuotaError'
  }
}

export class CloudVeloceRateLimitedError extends Error {
  constructor(message = 'Servizio temporaneamente occupato') {
    super(message)
    this.name = 'CloudVeloceRateLimitedError'
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

export async function transcribeCloud(
  audioBlob: Blob,
  language?: string,
): Promise<CloudTranscribeResult> {
  const base64 = await blobToBase64(audioBlob)
  // Stima approssimativa: 16kHz mono 16bit → 32000 byte/sec → /(16000*60*2) min
  const estimatedMinutes = audioBlob.size / (16000 * 60 * 2)

  const res = await fetch(`${API_URL}/v1/transcribe-cloud`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audioBlob: base64, estimatedMinutes, language }),
  })

  if (res.status === 403) {
    const body = await res.json().catch(() => null) as { message?: string } | null
    throw new CloudVeloceNotAvailableError(body?.message)
  }
  if (res.status === 429) {
    throw new CloudVeloceQuotaError()
  }
  if (res.status === 503) {
    const body = await res.json().catch(() => null) as { message?: string } | null
    throw new CloudVeloceRateLimitedError(body?.message)
  }
  if (!res.ok) {
    throw new Error(`Cloud transcription failed (${res.status})`)
  }
  return res.json() as Promise<CloudTranscribeResult>
}

export async function fetchCloudCheckout(pkg: string): Promise<string> {
  const res = await fetch(`${API_URL}/v1/transcribe-cloud/checkout?package=${encodeURIComponent(pkg)}`, {
    credentials: 'include',
  })
  if (!res.ok) throw new Error(`Checkout failed (${res.status})`)
  const data = await res.json() as { checkoutUrl: string }
  return data.checkoutUrl
}

export async function fetchCloudQuota(): Promise<QuotaInfo | null> {
  const res = await fetch(`${API_URL}/v1/transcribe-cloud/quota`, {
    credentials: 'include',
  })
  if (res.status === 401 || res.status === 403) return null
  if (!res.ok) return null
  return res.json() as Promise<QuotaInfo>
}
