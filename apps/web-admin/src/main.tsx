import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { initBrowserSentry } from './lib/sentry';
import '@hd-cpo/ui/styles.css';

// Portal hostname guard — see apps/web-dealer/src/main.tsx for the full
// rationale. Identical defence pattern, admin-specific env var name so
// dealer + admin can be on different subdomains independently.
const expectedHost = import.meta.env.VITE_PORTAL_HOSTNAME as string | undefined;
const buyerUrl = (import.meta.env.VITE_BUYER_URL as string | undefined) ?? '/';
if (expectedHost && typeof window !== 'undefined' && window.location.hostname !== expectedHost) {
  window.location.replace(buyerUrl);
  throw new Error('Portal host mismatch — redirecting to buyer site.');
}

initBrowserSentry();

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* Mounted under /admin on the production domain (Apache reverse-proxy);
          must match the Vite `base` in vite.config.ts. */}
      <BrowserRouter basename="/admin">
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
