import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
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

const pageVariants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -4 },
};

const pageTransition = {
  duration: 0.18,
  ease: [0.4, 0, 0.2, 1] as const,
};

function PageWrapper({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={pageTransition}
      className="flex-1"
    >
      {children}
    </motion.div>
  );
}

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<PageWrapper><LoginPage /></PageWrapper>} />
        <Route path="/auth/verify" element={<PageWrapper><VerifyPage /></PageWrapper>} />
        <Route path="/dashboard" element={
          <PageWrapper><RequireAuth><SyncGate><DashboardPage /></SyncGate></RequireAuth></PageWrapper>
        } />
        <Route path="/recording" element={
          <PageWrapper><RequireAuth><SyncGate><RecordingPage /></SyncGate></RequireAuth></PageWrapper>
        } />
        <Route path="/archive" element={
          <PageWrapper><RequireAuth><SyncGate><ArchivePage /></SyncGate></RequireAuth></PageWrapper>
        } />
        <Route path="/search" element={
          <PageWrapper><RequireAuth><SyncGate><ProRoute feature="Ricerca semantica"><SearchPage /></ProRoute></SyncGate></RequireAuth></PageWrapper>
        } />
        <Route path="/onboarding" element={
          <PageWrapper><RequireAuth><OnboardingPage /></RequireAuth></PageWrapper>
        } />
        <Route path="/calendar" element={
          <PageWrapper><RequireAuth><ProRoute feature="Calendario"><CalendarPage /></ProRoute></RequireAuth></PageWrapper>
        } />
        <Route path="/actions" element={
          <PageWrapper><RequireAuth><SyncGate><ProRoute feature="Dashboard Azioni"><ActionItemsPage /></ProRoute></SyncGate></RequireAuth></PageWrapper>
        } />
        <Route path="/sync/setup" element={
          <PageWrapper><RequireAuth><SyncSetupPage /></RequireAuth></PageWrapper>
        } />
        <Route path="/sync/unlock" element={
          <PageWrapper><RequireAuth><SyncUnlockPage /></RequireAuth></PageWrapper>
        } />
        <Route path="/pricing" element={
          <PageWrapper><RequireAuth><PricingPage /></RequireAuth></PageWrapper>
        } />
        <Route path="/billing/success" element={
          <PageWrapper><RequireAuth><BillingSuccessPage /></RequireAuth></PageWrapper>
        } />
        <Route path="/admin" element={
          <PageWrapper><RequireAuth><AdminPage /></RequireAuth></PageWrapper>
        } />
        <Route path="/clients" element={
          <PageWrapper><RequireAuth><SyncGate><ProRoute feature="Vista clienti"><ClientsPage /></ProRoute></SyncGate></RequireAuth></PageWrapper>
        } />
        <Route path="/templates" element={
          <PageWrapper><RequireAuth><SyncGate><TemplatesPage /></SyncGate></RequireAuth></PageWrapper>
        } />
        <Route path="/profile" element={
          <PageWrapper><RequireAuth><ProfilePage /></RequireAuth></PageWrapper>
        } />
        <Route path="/terms" element={<PageWrapper><TermsPage /></PageWrapper>} />
        <Route path="/privacy" element={<PageWrapper><PrivacyPage /></PageWrapper>} />
      </Routes>
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col">
        <AnimatedRoutes />
        <AppFooter />
      </div>
    </BrowserRouter>
  );
}