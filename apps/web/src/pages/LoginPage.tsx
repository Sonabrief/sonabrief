import { useState } from 'react';
import { API_URL } from '../config';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!email) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/auth/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          screen_resolution: `${window.screen.width}x${window.screen.height}`,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        if (data.error === 'disposable_email') {
          setError('Usa un indirizzo email reale — le email temporanee non sono accettate.');
        } else if (data.error === 'rate_limited') {
          setError('Troppi tentativi. Riprova tra qualche ora.');
        } else if (data.error === 'datacenter_ip_blocked') {
          setError('Registrazione non disponibile da questa rete.');
        } else {
          setError('Errore durante l\'invio. Riprova tra poco.');
        }
        setLoading(false);
        return;
      }
      setSent(true);
    } catch {
      setError('Errore di rete. Controlla la connessione e riprova.');
    }
    setLoading(false);
  }

  if (sent) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-semibold mb-2">Controlla la tua email</h1>
          <p className="text-gray-500">Abbiamo inviato un link di accesso a <strong>{email}</strong></p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold">Accedi a Sonabrief</h1>
        <input
          type="email"
          placeholder="La tua email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          className="w-full border rounded px-3 py-2 text-sm"
        />
        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full bg-[#1A4D52] text-white rounded px-3 py-2 text-sm disabled:opacity-50"
        >
          {loading ? 'Invio...' : 'Invia link di accesso'}
        </button>
      </div>
    </div>
  );
}
