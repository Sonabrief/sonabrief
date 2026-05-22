import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
} from '@simplewebauthn/browser'
import { API_URL } from '../config'

export function isWebAuthnSupported(): boolean {
  return browserSupportsWebAuthn()
}

export async function registerPasskey(deviceName: string): Promise<void> {
  const optsRes = await fetch(`${API_URL}/auth/webauthn/register/options`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  })
  const optsData = await optsRes.json() as { ok: boolean; options?: any; error?: string }
  if (!optsData.ok || !optsData.options) {
    throw new Error(optsData.error ?? 'options_failed')
  }

  const attResp = await startRegistration({ optionsJSON: optsData.options })

  const verifyRes = await fetch(`${API_URL}/auth/webauthn/register/verify`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ response: attResp, deviceName }),
  })
  const verifyData = await verifyRes.json() as { ok: boolean; error?: string }
  if (!verifyData.ok) {
    throw new Error(verifyData.error ?? 'verify_failed')
  }
}

export async function loginWithPasskey(email?: string): Promise<void> {
  const optsRes = await fetch(`${API_URL}/auth/webauthn/authenticate/options`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  const optsData = await optsRes.json() as { ok: boolean; options?: any; error?: string }
  if (!optsData.ok || !optsData.options) {
    throw new Error(optsData.error ?? 'options_failed')
  }

  const authResp = await startAuthentication({ optionsJSON: optsData.options })

  const verifyRes = await fetch(`${API_URL}/auth/webauthn/authenticate/verify`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ response: authResp }),
  })
  const verifyData = await verifyRes.json() as { ok: boolean; error?: string }
  if (!verifyData.ok) {
    throw new Error(verifyData.error ?? 'verify_failed')
  }
}

export interface PasskeyCredential {
  id: string
  device_name: string | null
  created_at: number
  last_used_at: number | null
}

export async function listPasskeys(): Promise<PasskeyCredential[]> {
  const res = await fetch(`${API_URL}/auth/webauthn/credentials`, {
    credentials: 'include',
  })
  const data = await res.json() as { ok: boolean; credentials?: PasskeyCredential[]; error?: string }
  if (!data.ok) throw new Error(data.error ?? 'list_failed')
  return data.credentials ?? []
}

export async function deletePasskey(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/auth/webauthn/credentials?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  const data = await res.json() as { ok: boolean; error?: string }
  if (!data.ok) throw new Error(data.error ?? 'delete_failed')
}
