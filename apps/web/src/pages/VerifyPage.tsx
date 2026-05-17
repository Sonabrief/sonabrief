import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { API_URL } from '../config';

export default function VerifyPage() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const navigate = useNavigate();

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) { setStatus('error'); return; }
    fetch(`${API_URL}/auth/verify?token=${token}`, { credentials: 'include' })
      .then(r => r.json())
      .then((data: { ok: boolean }) => {
        if (data.ok) {
          setTimeout(() => navigate('/dashboard', { replace: true }), 1000);
          setStatus('ok');
        } else {
          setStatus('error');
        }
      })
      .catch(() => setStatus('error'));
  }, []);

  if (status === 'loading') return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-gray-500">Verifica in corso...</p>
    </div>
  );
  if (status === 'ok') return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-semibold mb-2">Accesso effettuato</h1>
        <p className="text-gray-500">Reindirizzamento...</p>
      </div>
    </div>
  );
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-semibold mb-2">Link non valido</h1>
        <p className="text-gray-500">Il link è scaduto o già utilizzato.</p>
      </div>
    </div>
  );
}