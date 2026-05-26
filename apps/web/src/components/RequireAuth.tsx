import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getMe } from '../lib/api';
import { checkAndRequestPersistence } from '../lib/itp';
import { ITPWarningBanner } from './ITPWarningBanner';

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const [checking, setChecking] = useState(true);
  const [showItpBanner, setShowItpBanner] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    getMe().then(user => {
      if (!user) navigate('/', { replace: true });
      setChecking(false);
    });
    checkAndRequestPersistence().then(({ isSafari, isPersisted }) => {
      if (isSafari && !isPersisted) setShowItpBanner(true);
    });
  }, []);

  if (checking) return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-gray-400 text-sm">{t('auth_gate.loading')}</p>
    </div>
  );

  return (
    <>
      {children}
      {showItpBanner && (
        <ITPWarningBanner onDismiss={() => setShowItpBanner(false)} />
      )}
    </>
  );
}
