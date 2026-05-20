import { API_URL } from '../config';

export async function getMe(): Promise<{ userId: string; email: string } | null> {
  try {
    const res = await fetch(`${API_URL}/auth/me`, { credentials: 'include' });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export interface BillingStatus {
  tier: string
  billing_cycle: string | null
  status: string
  quota_used_minutes: number
  quota_cap_minutes: number | null
  renews_at: number | null
}

export async function getBillingStatus(): Promise<BillingStatus | null> {
  try {
    const res = await fetch(`${API_URL}/v1/billing/status`, { credentials: 'include' })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function getBillingPortalUrl(): Promise<string | null> {
  try {
    const res = await fetch(`${API_URL}/v1/billing/portal`, { credentials: 'include' })
    if (!res.ok) return null
    const data = await res.json() as { url: string }
    return data.url
  } catch {
    return null
  }
}

export interface UserPreferences {
  language: string
  profession: string | null
  profession_category: string | null
  context_note: string | null
  meeting_duration: string | null
  client_volume: string | null
  synthesis_mode: string
  sync_enabled: number
  onboarded: number
}

export async function getPreferences(): Promise<UserPreferences | null> {
  try {
    const res = await fetch(`${API_URL}/v1/preferences`, { credentials: 'include' })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function savePreferences(prefs: Partial<UserPreferences>): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/v1/preferences`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prefs),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function updatePreferences(prefs: {
  language?: string
  synthesis_mode?: string
  profession?: string
}): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/v1/preferences`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prefs),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function logout(): Promise<void> {
  await fetch(`${API_URL}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });
}