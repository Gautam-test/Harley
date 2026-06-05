import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { DealersPage } from './pages/DealersPage';
import { ListingsPage } from './pages/ListingsPage';
import { EnquiriesPage } from './pages/EnquiriesPage';
import { EnquiryDetailPage } from './pages/EnquiryDetailPage';
// QA BUG-017: ContentPage import removed — module dropped from admin scope.
import { AuditPage } from './pages/AuditPage';
import { ProfilePage } from './pages/ProfilePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { AdminShell } from './components/AdminShell';
import { useAuthStore } from './store/auth';

export function App() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken));
  const sessionExpiresAt = useAuthStore((s) => s.sessionExpiresAt);

  // Proactive 12h auto-logout — see web-dealer/App.tsx for the rationale.
  useEffect(() => {
    if (!isAuthed || !sessionExpiresAt) return;
    const ms = sessionExpiresAt - Date.now();
    if (ms <= 0) {
      try { window.sessionStorage.setItem('hd-cpo:session-expired', '1'); } catch { /* ignore */ }
      useAuthStore.getState().clear();
      return;
    }
    const t = window.setTimeout(() => {
      try { window.sessionStorage.setItem('hd-cpo:session-expired', '1'); } catch { /* ignore */ }
      useAuthStore.getState().clear();
    }, ms);
    return () => window.clearTimeout(t);
  }, [isAuthed, sessionExpiresAt]);
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {isAuthed ? (
        <Route element={<AdminShell />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/dealers" element={<DealersPage />} />
          <Route path="/listings" element={<ListingsPage />} />
          <Route path="/enquiries" element={<EnquiriesPage />} />
          <Route path="/enquiries/:kind/:id" element={<EnquiryDetailPage />} />
          {/* QA BUG-017: /content route removed entirely. */}
          <Route path="/audit" element={<AuditPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          {/* QA BUG-014: authed catch-all renders a static 404 instead
              of silently redirecting to /dashboard (which would fire
              every dashboard query for a clearly invalid URL). */}
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      ) : null}
      {/* Unauthed catch-all still funnels to /login — there is no public
          admin surface to expose, and the 404 page itself depends on the
          shell + sidebar so it isn't safe to render unauthenticated. */}
      {!isAuthed && (
        <Route path="*" element={<Navigate to="/login" replace />} />
      )}
    </Routes>
  );
}
