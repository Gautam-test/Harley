import { Navigate, Route, Routes } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { DealersPage } from './pages/DealersPage';
import { ListingsPage } from './pages/ListingsPage';
import { EnquiriesPage } from './pages/EnquiriesPage';
import { ContentPage } from './pages/ContentPage';
import { AuditPage } from './pages/AuditPage';
import { AdminShell } from './components/AdminShell';
import { useAuthStore } from './store/auth';

export function App() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken));
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {isAuthed ? (
        <Route element={<AdminShell />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/dealers" element={<DealersPage />} />
          <Route path="/listings" element={<ListingsPage />} />
          <Route path="/enquiries" element={<EnquiriesPage />} />
          <Route path="/content" element={<ContentPage />} />
          <Route path="/audit" element={<AuditPage />} />
        </Route>
      ) : null}
      <Route path="*" element={<Navigate to={isAuthed ? '/dashboard' : '/login'} replace />} />
    </Routes>
  );
}
