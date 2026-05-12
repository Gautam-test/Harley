import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { MyListingsPage } from './pages/MyListingsPage';
import { AddListingPage } from './pages/AddListingPage';
import { LeadsPage } from './pages/LeadsPage';
import { LeadDetailPage } from './pages/LeadDetailPage';
import { ProfilePage } from './pages/ProfilePage';
import { DealerShell } from './components/DealerShell';
import { useAuthStore } from './store/auth';

export function App() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken));
  const sessionExpiresAt = useAuthStore((s) => s.sessionExpiresAt);

  // Proactive 12h auto-logout (QA: "after 12h the session should expire").
  // Server enforces the cap on /auth/refresh, but an idle user who never
  // makes a request would otherwise sit with a stale UI past the cap. We
  // schedule a single timeout for the exact session-expiry moment; on
  // fire, clear auth + raise the session-expired flag. The accessToken
  // turning null re-renders the route tree, which routes the user to
  // /login, where the LoginPage reads the flag and shows the timeout
  // banner.
  useEffect(() => {
    if (!isAuthed || !sessionExpiresAt) return;
    const ms = sessionExpiresAt - Date.now();
    if (ms <= 0) {
      // Already expired (e.g. tab restored from sleep past the ceiling).
      try { window.sessionStorage.setItem('hd-cpo:session-expired', '1'); } catch { /* ignore */ }
      useAuthStore.getState().clear();
      return;
    }
    // setTimeout is capped at ~24.8 days (2^31 ms) — well above the 12h
    // session, so a direct schedule is safe.
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
        <Route element={<DealerShell />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/listings" element={<MyListingsPage />} />
          <Route path="/listings/new" element={<AddListingPage />} />
          {/* Edit-existing route — used when a dealer needs to revise a
              DRAFT that admin returned with feedback. Same wizard, just
              hydrates from GET /dealer/listings/:id and PATCHes on submit. */}
          <Route path="/listings/:id/edit" element={<AddListingPage />} />
          <Route path="/leads" element={<Navigate to="/leads/buyer" replace />} />
          {/* Old /leads/general bookmarks — redirect to buyer (closest equivalent). */}
          <Route path="/leads/general" element={<Navigate to="/leads/buyer" replace />} />
          <Route path="/leads/general/:id" element={<Navigate to="/leads/buyer" replace />} />
          <Route path="/leads/:kind" element={<LeadsPage />} />
          <Route path="/leads/:kind/:id" element={<LeadDetailPage />} />
          {/* Settings page retired May 2026; replaced by view-only Profile. */}
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/settings" element={<Navigate to="/profile" replace />} />
        </Route>
      ) : null}
      <Route path="*" element={<Navigate to={isAuthed ? '/dashboard' : '/login'} replace />} />
    </Routes>
  );
}
