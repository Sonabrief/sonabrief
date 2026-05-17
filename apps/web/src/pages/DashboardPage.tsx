import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMe, logout } from '../lib/api';

export default function DashboardPage() {
  const [email, setEmail] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    getMe().then(user => {
      if (user) setEmail(user.email);
    });
  }, []);

  async function handleLogout() {
    await logout();
    navigate('/', { replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-semibold">Benvenuto su Sonabrief</h1>
        {email && <p className="text-gray-500 text-sm">{email}</p>}
        <button
          onClick={handleLogout}
          className="text-sm text-gray-400 underline"
        >
          Esci
        </button>
      </div>
    </div>
  );
}