import { getEnv } from './env.js';
import { logger } from './logger.js';

// Env-gated Sentry init. The Sentry SDK is intentionally NOT a hard dependency
// of this package — installing it bloats the build for self-hosted/dev usage.
// To enable in staging/prod:
//
//   1. Add the SDK to apps/api:
//        pnpm --filter @hd-cpo/api add @sentry/node
//   2. Set env at deploy time:
//        SENTRY_DSN=https://<key>@<org>.ingest.sentry.io/<project>
//        SENTRY_ENVIRONMENT=production           # or staging
//        SENTRY_TRACES_SAMPLE_RATE=0.1            # 10% APM sample
//   3. Restart the API. This module dynamic-imports `@sentry/node` and inits.
//
// Without those steps the function is a silent no-op — safe in dev/CI.
export async function initSentry(): Promise<void> {
  const env = getEnv();
  if (!env.SENTRY_DSN) return;

  try {
    // @ts-expect-error — package not in dependencies until ops adds it.
    const Sentry = await import('@sentry/node');
    Sentry.init({
      dsn: env.SENTRY_DSN,
      environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
      tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
      release: process.env.npm_package_version,
    });
    logger.info({ environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV }, 'Sentry initialised');
  } catch (e) {
    logger.warn(
      { err: e instanceof Error ? e.message : String(e) },
      'SENTRY_DSN is set but @sentry/node is not installed — run `pnpm add @sentry/node` in apps/api',
    );
  }
}
