import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import VerifyPage from './pages/VerifyPage';
import DashboardPage from './pages/DashboardPage';
import RecordingPage from './pages/RecordingPage';
import ArchivePage from './pages/ArchivePage';
import RequireAuth from './components/RequireAuth';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/auth/verify" element={<VerifyPage />} />
        <Route path="/dashboard" element={
          <RequireAuth>
            <DashboardPage />
          </RequireAuth>
        } />
        <Route path="/recording" element={
          <RequireAuth>
            <RecordingPage />
          </RequireAuth>
        } />
        <Route path="/archive" element={
          <RequireAuth>
            <ArchivePage />
          </RequireAuth>
        } />
      </Routes>
    </BrowserRouter>
  );
}