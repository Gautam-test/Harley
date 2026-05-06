import { createApp } from './app.js';
import { getEnv } from './config/env.js';
import { logger } from './config/logger.js';
import { prisma } from './config/prisma.js';
import { redis } from './config/redis.js';
import { initSentry } from './config/sentry.js';

const env = getEnv();
// Sentry is initialised before the app is created so that any startup-time
// errors (Prisma connect, Redis connect) are captured. No-ops if SENTRY_DSN
// is unset, so dev / CI remain offline-clean.
await initSentry();
const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(
    { port: env.PORT, env: env.NODE_ENV },
    `H-D CPO API listening on http://localhost:${env.PORT}/api/docs`,
  );
});

async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down…');
  server.close(async () => {
    await prisma.$disconnect();
    redis.disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
