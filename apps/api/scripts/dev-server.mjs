// Local dev orchestrator — boots an embedded Postgres, runs migrations, then
// starts the API with tsx watch. No Docker, no native install required.
//
// Postgres data lives at apps/api/.devdb/  (gitignored).
// Skip this and use a real Postgres by setting EMBEDDED_DB=0 in the environment.

import EmbeddedPostgres from 'embedded-postgres';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, '..');
const dataDir = path.join(apiRoot, '.devdb');

// Lightweight .env loader — runs before the API process starts, so we can
// see EMBEDDED_DB=0 / DATABASE_URL etc. set in apps/api/.env without
// depending on dotenv (which the API loads later).
const envPath = path.join(apiRoot, '.env');
if (existsSync(envPath)) {
  for (const rawLine of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = val;
  }
}

const PG_USER = 'hdcpo';
const PG_PASSWORD = 'hdcpo_dev_password';
// Default to 55432 — port 5432 is often blocked on Windows by Hyper-V's
// reserved port range, even when nothing is actually listening on it.
const PG_PORT = Number(process.env.EMBEDDED_PG_PORT ?? 55432);
const PG_DB = 'hd_cpo_marketplace';

const useEmbedded = process.env.EMBEDDED_DB !== '0';

let pg = null;
let apiProcess = null;
let shuttingDown = false;

function log(msg) {
  console.log(`[dev-server] ${msg}`);
}

async function startPostgres() {
  if (!useEmbedded) {
    log('EMBEDDED_DB=0 — assuming external Postgres at DATABASE_URL');
    return;
  }
  await mkdir(dataDir, { recursive: true });
  const firstRun = !existsSync(path.join(dataDir, 'PG_VERSION'));

  pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: PG_USER,
    password: PG_PASSWORD,
    port: PG_PORT,
    persistent: true,
    authMethod: 'password',
    onLog: (m) => process.stdout.write(`[pg] ${m}`),
    onError: (e) => console.error('[pg-err]', e),
  });

  if (firstRun) {
    log('Initialising embedded Postgres (first run, ~5s)…');
    await pg.initialise();
  }

  log(`Starting embedded Postgres on port ${PG_PORT}…`);
  await pg.start();

  if (firstRun) {
    try {
      await pg.createDatabase(PG_DB);
      log(`Created database "${PG_DB}"`);
    } catch (err) {
      // already exists is fine
      if (!String(err).includes('already exists')) throw err;
    }
  }
  log('Embedded Postgres ready.');
}

function runOnce(cmd, args, label) {
  return new Promise((resolve, reject) => {
    log(`Running ${label}…`);
    const child = spawn(cmd, args, {
      cwd: apiRoot,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: process.env,
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${label} exited with code ${code}`));
    });
  });
}

async function migrate() {
  // prisma migrate deploy applies pending migrations idempotently.
  // For the very first run with no migrations folder, fall back to db push.
  const migrationsDir = path.join(apiRoot, 'prisma', 'migrations');
  if (existsSync(migrationsDir)) {
    await runOnce(
      'pnpm',
      ['exec', 'prisma', 'migrate', 'deploy', '--schema=./prisma/schema.prisma'],
      'prisma migrate deploy',
    );
  } else {
    log('No migrations folder yet — using `prisma db push` to sync schema.');
    await runOnce(
      'pnpm',
      ['exec', 'prisma', 'db', 'push', '--schema=./prisma/schema.prisma', '--skip-generate'],
      'prisma db push',
    );
  }
}

async function ensurePrismaClient() {
  // Skip if the engine + index already exist; regenerating while another process
  // holds the engine DLL fails with EPERM on Windows. Schema changes still need
  // a manual `pnpm prisma:generate`.
  const generated = path.join(
    apiRoot,
    '..',
    '..',
    'node_modules',
    '.pnpm',
    '@prisma+client@5.22.0_prisma@5.22.0',
    'node_modules',
    '.prisma',
    'client',
    'index.js',
  );
  if (existsSync(generated)) {
    log('Prisma client already generated — skipping.');
    return;
  }
  await runOnce('pnpm', ['run', 'prisma:generate'], 'prisma generate');
}

async function maybeSeed() {
  // Only seed if the DB is empty (no admin users yet).
  if (process.env.SKIP_SEED === '1') return;
  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    const count = await prisma.adminUser.count();
    await prisma.$disconnect();
    if (count === 0) {
      await runOnce('pnpm', ['run', 'prisma:seed'], 'prisma seed');
    } else {
      log(`Seed skipped — ${count} admin user(s) already in DB.`);
    }
  } catch (err) {
    console.warn('[dev-server] Seed check failed (non-fatal):', err.message);
  }
}

function startApi() {
  return new Promise((resolve) => {
    log('Starting API (tsx watch src/main.ts)…');
    apiProcess = spawn('pnpm', ['exec', 'tsx', 'watch', 'src/main.ts'], {
      cwd: apiRoot,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: process.env,
    });
    apiProcess.on('exit', (code) => {
      log(`API process exited with code ${code}`);
      void shutdown(code ?? 0);
    });
    resolve();
  });
}

async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  log('Shutting down…');
  if (apiProcess && !apiProcess.killed) {
    try {
      apiProcess.kill();
    } catch {}
  }
  if (pg) {
    try {
      await pg.stop();
    } catch (err) {
      console.warn('[dev-server] pg.stop failed:', err);
    }
  }
  process.exit(code);
}

process.on('SIGINT', () => void shutdown(0));
process.on('SIGTERM', () => void shutdown(0));

(async () => {
  try {
    await startPostgres();
    await ensurePrismaClient();
    await migrate();
    await maybeSeed();
    await startApi();
  } catch (err) {
    console.error('[dev-server] Fatal:', err && (err.stack ?? err.message ?? err));
    if (err?.cause) console.error('[dev-server] Cause:', err.cause);
    await shutdown(1);
  }
})();
