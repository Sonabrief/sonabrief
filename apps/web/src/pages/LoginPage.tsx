import { useState } from 'react';
import { API_URL } from '../config';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!email) return;
    setLoading(true);
    await fetch(`${API_URL}/auth/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    setSent(true);
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
          className="w-full border rounded px-3 py-2 text-sm"
        />
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full bg-[#1A4D52] text-white rounded px-3 py-2 text-sm"
        >
          {loading ? 'Invio...' : 'Invia link di accesso'}
        </button>
      </div>
    </div>
  );
}