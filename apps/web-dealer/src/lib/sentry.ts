// Env-gated Sentry init for the dealer SPA. See web-buyer/src/lib/sentry.ts
// for the 4-step setup recipe — same pattern.
export function initBrowserSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;
  // eslint-disable-next-line no-console
  console.warn(
    'VITE_SENTRY_DSN is set but @sentry/react has not been wired in. ' +
      'See apps/web-buyer/src/lib/sentry.ts for the 4-step setup.',
  );
}
