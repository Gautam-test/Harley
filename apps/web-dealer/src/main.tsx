import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { initBrowserSentry } from './lib/sentry';
import '@hd-cpo/ui/styles.css';

// ─────────────────────────────────────────────────────────────────────
// Portal hostname guard — keeps customers off the dealer panel.
//
// Concern: on the single-domain demo deployment (harleydavidson.ciadmin.in/dealer)
// a customer who types /dealer at the end of the URL reaches the dealer
// SPA. The login itself is auth-gated by the API so no dealer data leaks,
// but the client wanted the page itself to be unreachable.
//
// Defence: if VITE_PORTAL_HOSTNAME is set at build time, the SPA refuses
// to render on any other hostname and immediately redirects back to
// VITE_BUYER_URL (or "/" if that's not set). When the env var is absent
// (local dev, or path-based demo where ops hasn't split subdomains yet)
// the guard is a no-op so we don't break those setups.
//
// To activate in prod, set in apps/web-dealer/.env.production:
//   VITE_PORTAL_HOSTNAME=dealer.hd-certified.in
//   VITE_BUYER_URL=https://hd-certified.in
//
// This is belt-and-suspenders against the nginx subdomain split — if the
// nginx rule is ever mis-written and the dealer SPA ends up served on the
// buyer host, this still bounces the customer out before any UI renders.
// ─────────────────────────────────────────────────────────────────────
const expectedHost = import.meta.env.VITE_PORTAL_HOSTNAME as string | undefined;
const buyerUrl = (import.meta.env.VITE_BUYER_URL as string | undefined) ?? '/';
if (expectedHost && typeof window !== 'undefined' && window.location.hostname !== expectedHost) {
  // Use replace() so the dealer URL isn't kept in browser history — a
  // customer hitting Back shouldn't be able to reach it again.
  window.location.replace(buyerUrl);
  // Stop module evaluation — don't render the SPA at all.
  throw new Error('Portal host mismatch — redirecting to buyer site.');
}

initBrowserSentry();

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* Mounted under /dealer on the production domain (Apache reverse-proxy);
          must match the Vite `base` in vite.config.ts so internal links and
          asset URLs all stay inside this SPA's path namespace. */}
      <BrowserRouter basename="/dealer">
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
