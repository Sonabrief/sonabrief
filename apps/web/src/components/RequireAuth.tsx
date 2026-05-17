import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMe } from '../lib/api';

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const [checking, setChecking] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    getMe().then(user => {
      if (!user) navigate('/', { replace: true });
      setChecking(false);
    });
  }, []);

  if (checking) return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-gray-400 text-sm">Caricamento...</p>
    </div>
  );

  return <>{children}</>;
}