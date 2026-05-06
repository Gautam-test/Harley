import { Navigate, Route, Routes } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { MyListingsPage } from './pages/MyListingsPage';
import { AddListingPage } from './pages/AddListingPage';
import { LeadsPage } from './pages/LeadsPage';
import { LeadDetailPage } from './pages/LeadDetailPage';
import { SettingsPage } from './pages/SettingsPage';
import { DealerShell } from './components/DealerShell';
import { useAuthStore } from './store/auth';

export function App() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken));
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {isAuthed ? (
        <Route element={<DealerShell />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/listings" element={<MyListingsPage />} />
          <Route path="/listings/new" element={<AddListingPage />} />
          <Route path="/leads" element={<Navigate to="/leads/general" replace />} />
          <Route path="/leads/:kind" element={<LeadsPage />} />
          <Route path="/leads/:kind/:id" element={<LeadDetailPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      ) : null}
      <Route path="*" element={<Navigate to={isAuthed ? '/dashboard' : '/login'} replace />} />
    </Routes>
  );
}
