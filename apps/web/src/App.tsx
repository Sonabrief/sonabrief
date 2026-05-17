import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import VerifyPage from './pages/VerifyPage';
import DashboardPage from './pages/DashboardPage';
import RecordingPage from './pages/RecordingPage';
import ArchivePage from './pages/ArchivePage';
import SyncSetupPage from './pages/SyncSetupPage';
import SyncUnlockPage from './pages/SyncUnlockPage';
import PricingPage from './pages/PricingPage';
import RequireAuth from './components/RequireAuth';
import SyncGate from './components/SyncGate';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/auth/verify" element={<VerifyPage />} />
        <Route path="/dashboard" element={
          <RequireAuth>
            <SyncGate>
              <DashboardPage />
            </SyncGate>
          </RequireAuth>
        } />
        <Route path="/recording" element={
          <RequireAuth>
            <SyncGate>
              <RecordingPage />
            </SyncGate>
          </RequireAuth>
        } />
        <Route path="/archive" element={
          <RequireAuth>
            <SyncGate>
              <ArchivePage />
            </SyncGate>
          </RequireAuth>
        } />
        <Route path="/sync/setup" element={
          <RequireAuth>
            <SyncSetupPage />
          </RequireAuth>
        } />
        <Route path="/sync/unlock" element={
          <RequireAuth>
            <SyncUnlockPage />
          </RequireAuth>
        } />
        <Route path="/pricing" element={
          <RequireAuth>
            <PricingPage />
          </RequireAuth>
        } />
      </Routes>
    </BrowserRouter>
  );
}