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

export async function logout(): Promise<void> {
  await fetch(`${API_URL}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });
}