import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { getEnv } from './config/env.js';
import { logger } from './config/logger.js';
import { prisma } from './config/prisma.js';
import { redis } from './config/redis.js';
import { initSentry } from './config/sentry.js';

const env = getEnv();

// Auto-apply pending DB migrations on every boot.
// This means a `git pull` + `pm2 restart harley-api` is enough to ship a
// migration — no separate `pnpm prisma:deploy` step needed. Idempotent:
// prisma migrate deploy is a no-op when there are no pending migrations.
// Skipped when AUTO_MIGRATE=0 (e.g. ephemeral test runs).
if (process.env.AUTO_MIGRATE !== '0') {
  try {
    // Resolve the API package root so `npx prisma` finds the schema +
    // migrations regardless of where the process was started from.
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const apiRoot = path.resolve(__dirname, '..');
    const schemaPath = path.join(apiRoot, 'prisma', 'schema.prisma');
    if (existsSync(schemaPath)) {
      const spawnEnv = { ...process.env, PRISMA_GENERATE_SKIP_AUTOINSTALL: '1' };
      const spawnOpts = {
        cwd: apiRoot,
        stdio: 'pipe' as const,
        encoding: 'utf8' as const,
        shell: process.platform === 'win32',
        env: spawnEnv,
      };

      // 1) Apply pending migrations (DB schema)
      logger.info('Running prisma migrate deploy…');
      const migRes = spawnSync(
        'npx',
        ['--yes', 'prisma', 'migrate', 'deploy', '--schema', schemaPath],
        spawnOpts,
      );
      if (migRes.status === 0) {
        logger.info({ migrate: migRes.stdout.split('\n').slice(-5).join(' ').trim() }, '✓ migrate deploy complete');
      } else {
        logger.error({ stdout: migRes.stdout, stderr: migRes.stderr }, '✗ migrate deploy failed — continuing boot');
      }

      // 2) Regenerate Prisma client (TS types + runtime) so the just-applied
      //    columns are queryable. Without this, `prisma.listing.create({ data: {
      //    registrationNumber: ... } })` throws PrismaClientValidationError
      //    'Unknown argument registrationNumber' even though the DB column exists.
      logger.info('Running prisma generate…');
      const genRes = spawnSync(
        'npx',
        ['--yes', 'prisma', 'generate', '--schema', schemaPath],
        spawnOpts,
      );
      if (genRes.status === 0) {
        logger.info('✓ prisma generate complete');
      } else {
        logger.error({ stdout: genRes.stdout, stderr: genRes.stderr }, '✗ prisma generate failed — continuing boot');
      }
    } else {
      logger.warn({ schemaPath }, 'schema.prisma not found, skipping auto-migrate');
    }
  } catch (e) {
    logger.error({ err: e }, 'Auto-migrate threw — continuing boot');
  }
}

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
