import { useEffect } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { MyListingsPage } from './pages/MyListingsPage';
import { AddListingPage } from './pages/AddListingPage';
import { LeadsPage } from './pages/LeadsPage';
import { LeadDetailPage } from './pages/LeadDetailPage';
import { ProfilePage } from './pages/ProfilePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { DealerShell } from './components/DealerShell';
import { useAuthStore } from './store/auth';

// Tiny redirect shims so legacy /leads/:kind and /leads/:kind/:id URLs
// (sidebar bookmarks from older builds, deep links shared via email)
// land on the new unified /enquiries route preserving the kind segment.
function LegacyLeadsRedirect() {
  const { kind } = useParams<{ kind: string }>();
  return <Navigate to={`/enquiries/${kind ?? ''}`} replace />;
}

function LegacyLeadDetailRedirect() {
  const { kind, id } = useParams<{ kind: string; id: string }>();
  return <Navigate to={`/enquiries/${kind ?? 'buyer'}/${id ?? ''}`} replace />;
}

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
          {/* Unified /enquiries page — All / Buyer / Seller tabs.
              /enquiries (no kind) = All tab; /enquiries/buyer and
              /enquiries/trade-in deep-link to those specific tabs. */}
          <Route path="/enquiries" element={<LeadsPage />} />
          <Route path="/enquiries/:kind" element={<LeadsPage />} />
          <Route
            path="/enquiries/:kind/:id"
            element={<LeadDetailPage />}
          />
          {/* Legacy /leads/* routes — preserved so dealer sidebar bookmarks
              and any existing deep links keep working. All redirect to the
              new /enquiries URL with the same kind preserved. */}
          <Route path="/leads" element={<Navigate to="/enquiries" replace />} />
          <Route
            path="/leads/general"
            element={<Navigate to="/enquiries/buyer" replace />}
          />
          <Route
            path="/leads/general/:id"
            element={<Navigate to="/enquiries/buyer" replace />}
          />
          <Route
            path="/leads/:kind"
            element={<LegacyLeadsRedirect />}
          />
          <Route
            path="/leads/:kind/:id"
            element={<LegacyLeadDetailRedirect />}
          />
          {/* Settings page retired May 2026; replaced by view-only Profile. */}
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/settings" element={<Navigate to="/profile" replace />} />
          {/* QA BUG-014: authed catch-all renders a static 404 instead
              of silently redirecting to /dashboard (which would fire
              every dashboard query for a clearly invalid URL). */}
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      ) : null}
      {!isAuthed && (
        <Route path="*" element={<Navigate to="/login" replace />} />
      )}
    </Routes>
  );
}
