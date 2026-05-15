import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import VerifyPage from './pages/VerifyPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/auth/verify" element={<VerifyPage />} />
      </Routes>
    </BrowserRouter>
  );
}