// Env-gated Sentry init for the buyer SPA.
//
// Sentry is intentionally NOT a dependency of this package — the bundler
// would refuse to pre-bundle a missing package, even behind a dynamic import.
// To enable in staging/prod, the deploying team:
//
//   1. Adds the SDK:
//        pnpm --filter @hd-cpo/web-buyer add @sentry/react
//   2. Sets env at build time (apps/web-buyer/.env.production):
//        VITE_SENTRY_DSN=https://<browser-key>@<org>.ingest.sentry.io/<project>
//        VITE_SENTRY_ENVIRONMENT=production
//        VITE_SENTRY_TRACES_SAMPLE_RATE=0.1
//   3. Replaces the body of `initBrowserSentry` below with:
//        import * as Sentry from '@sentry/react';
//        Sentry.init({
//          dsn,
//          environment: ...,
//          tracesSampleRate: ...,
//        });
//   4. Re-builds.
//
// Today this function logs a one-shot warning when DSN is set but the SDK
// is missing, then no-ops. With DSN unset (default) it's silent.
export function initBrowserSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;

  // eslint-disable-next-line no-console
  console.warn(
    'VITE_SENTRY_DSN is set but @sentry/react has not been wired in. ' +
      'See apps/web-buyer/src/lib/sentry.ts for the 4-step setup.',
  );
}
