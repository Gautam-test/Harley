import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { initBrowserSentry } from './lib/sentry';
import '@hd-cpo/ui/styles.css';

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
