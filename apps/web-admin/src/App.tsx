import { useEffect } from 'react';
import { Route, Routes } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { DealersPage } from './pages/DealersPage';
import { ListingsPage } from './pages/ListingsPage';
import { EnquiriesPage } from './pages/EnquiriesPage';
import { EnquiryDetailPage } from './pages/EnquiryDetailPage';
// QA BUG-017: ContentPage import removed — module dropped from admin scope.
// AuditPage removed per QA decision — Audit section dropped from admin scope.
import { ProfilePage } from './pages/ProfilePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { AdminShell } from './components/AdminShell';
import { useAuthStore } from './store/auth';

export function App() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken));
  const sessionExpiresAt = useAuthStore((s) => s.sessionExpiresAt);

  // Proactive 24h auto-logout (ENH-001) — see web-dealer/App.tsx for
  // the full rationale. SPA mirrors the server's sessionExpiresAt so the
  // duration is driven by the JWT_REFRESH_TTL_SECONDS env var, not
  // hardcoded here.
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
          {/* /audit route removed — Audit section dropped from admin scope. */}
          <Route path="/profile" element={<ProfilePage />} />
        </Route>
      ) : null}
      {/* BUG-057: catch-all renders the 404 page as a STANDALONE
          layout (own header + footer, no AdminShell sidebar / profile
          chip). NotFoundPage internally branches on the auth store —
          authed admin sees "Back to Dashboard" + quick-jump links;
          unauthed visitor sees only "Go to Admin Login" so no
          protected route names or layout chrome are disclosed. The
          rule applies whether or not the visitor is authed, which is
          why it lives outside the shell block. */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
