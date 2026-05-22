import { API_URL } from '../config'

export interface WhitelistEntry {
  user_id: string
  email: string | null
  reason: 'payment_auto' | 'admin_override'
  granted_by: string | null
  granted_at: number
  notes: string | null
}

export async function fetchWhitelist(): Promise<WhitelistEntry[]> {
  const res = await fetch(`${API_URL}/admin/whitelist`, { credentials: 'include' })
  const data = await res.json() as { ok: boolean; entries?: WhitelistEntry[]; error?: string }
  if (!data.ok) throw new Error(data.error ?? 'fetch_failed')
  return data.entries ?? []
}

export async function addToWhitelist(email: string, notes: string | null): Promise<void> {
  const res = await fetch(`${API_URL}/admin/whitelist`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, notes }),
  })
  const data = await res.json() as { ok: boolean; error?: string }
  if (!data.ok) throw new Error(data.error ?? 'add_failed')
}

export async function removeFromWhitelist(userId: string): Promise<void> {
  const res = await fetch(`${API_URL}/admin/whitelist?user_id=${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  const data = await res.json() as { ok: boolean; error?: string }
  if (!data.ok) throw new Error(data.error ?? 'remove_failed')
}
