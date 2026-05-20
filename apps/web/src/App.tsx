import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import VerifyPage from './pages/VerifyPage';
import DashboardPage from './pages/DashboardPage';
import RecordingPage from './pages/RecordingPage';
import ArchivePage from './pages/ArchivePage';
import SyncSetupPage from './pages/SyncSetupPage';
import SyncUnlockPage from './pages/SyncUnlockPage';
import PricingPage from './pages/PricingPage';
import BillingSuccessPage from './pages/BillingSuccessPage';
import AdminPage from './pages/AdminPage';
import OnboardingPage from './pages/OnboardingPage';
import CalendarPage from './pages/CalendarPage';
import ActionItemsPage from './pages/ActionItemsPage';
import SearchPage from './pages/SearchPage';
import ClientsPage from './pages/ClientsPage';
import TemplatesPage from './pages/TemplatesPage';
import RequireAuth from './components/RequireAuth';
import SyncGate from './components/SyncGate';
import ProRoute from './components/ProRoute';
import TermsPage from './pages/TermsPage';
import PrivacyPage from './pages/PrivacyPage';
import ProfilePage from './pages/ProfilePage';
import { AppFooter } from './components/AppFooter';

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col">
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/auth/verify" element={<VerifyPage />} />
        <Route path="/dashboard" element={
          <RequireAuth><SyncGate><DashboardPage /></SyncGate></RequireAuth>
        } />
        <Route path="/recording" element={
          <RequireAuth><SyncGate><RecordingPage /></SyncGate></RequireAuth>
        } />
        <Route path="/archive" element={
          <RequireAuth><SyncGate><ArchivePage /></SyncGate></RequireAuth>
        } />
        <Route path="/search" element={
          <RequireAuth><SyncGate><ProRoute feature="Ricerca semantica"><SearchPage /></ProRoute></SyncGate></RequireAuth>
        } />
        <Route path="/onboarding" element={
          <RequireAuth><OnboardingPage /></RequireAuth>
        } />
        <Route path="/calendar" element={
          <RequireAuth><ProRoute feature="Calendario"><CalendarPage /></ProRoute></RequireAuth>
        } />
        <Route path="/actions" element={
          <RequireAuth><SyncGate><ProRoute feature="Dashboard Azioni"><ActionItemsPage /></ProRoute></SyncGate></RequireAuth>
        } />
        <Route path="/sync/setup" element={
          <RequireAuth><SyncSetupPage /></RequireAuth>
        } />
        <Route path="/sync/unlock" element={
          <RequireAuth><SyncUnlockPage /></RequireAuth>
        } />
        <Route path="/pricing" element={
          <RequireAuth><PricingPage /></RequireAuth>
        } />
        <Route path="/billing/success" element={
          <RequireAuth><BillingSuccessPage /></RequireAuth>
        } />
        <Route path="/admin" element={
          <RequireAuth><AdminPage /></RequireAuth>
        } />
        <Route path="/clients" element={
          <RequireAuth><SyncGate><ProRoute feature="Vista clienti"><ClientsPage /></ProRoute></SyncGate></RequireAuth>
        } />
        <Route path="/templates" element={
          <RequireAuth><SyncGate><TemplatesPage /></SyncGate></RequireAuth>
        } />
        <Route path="/profile" element={
          <RequireAuth><ProfilePage /></RequireAuth>
        } />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
      </Routes>
      <AppFooter />
      </div>
    </BrowserRouter>
  );
}
