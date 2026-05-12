// Reproduces the QA "session expires after 15-20 min" scenario and verifies
// the restart-tolerance fix.
//
// Steps:
//  1. Login → keep refresh token
//  2. Restart the API (kills it, starts a fresh one) — mock-Redis loses all
//     active rt-jti keys
//  3. Refresh with the pre-restart token → expect 200 (restart-tolerance
//     accepts because token.iat < new process_start)
//  4. Hit a protected route with the new access token → 200
//
// Run after `pnpm dev` is running. Requires the dev-server scripts that
// auto-restart the API (npx tsx watch / nodemon-style); if your local setup
// uses a one-shot `node dist/main.js`, restart manually between steps 2-3.

import { spawn } from 'node:child_process';

const API = 'http://localhost:4001/api/v1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function postJson(path, body) {
  const res = await fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* ignore */ }
  return { status: res.status, body: json };
}

async function getWithAuth(path, token) {
  const res = await fetch(API + path, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

function ok(label, cond, extra = '') {
  const tag = cond ? '✅ PASS' : '❌ FAIL';
  console.log(`${tag} — ${label}${extra ? ' — ' + extra : ''}`);
  if (!cond) process.exitCode = 1;
}

async function waitForApiUp(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(API + '/health');
      if (r.ok) return true;
    } catch { /* ignore */ }
    await sleep(500);
  }
  return false;
}

(async () => {
  console.log('\n=== Step 1: Login ===');
  const login = await postJson('/auth/dealer/login', {
    username: 'gurgaon-hd',
    password: 'Dealer@123!',
  });
  ok('login OK', login.status === 200, `status=${login.status}`);
  const refreshToken = login.body.refreshToken;
  console.log('   refresh token captured');

  console.log('\n=== Step 2: Simulate API restart ===');
  // Kill anything on :4001, then start a fresh `pnpm --filter @hd-cpo/api dev`.
  // The mock Redis instance dies with the process, wiping all rt-jti keys.
  console.log('   Killing whatever is on :4001 …');
  await new Promise((resolve) => {
    const k = spawn(
      'powershell.exe',
      ['-NoProfile', '-Command', 'Get-NetTCPConnection -LocalPort 4001 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }'],
      { stdio: 'inherit' },
    );
    k.on('exit', resolve);
  });
  await sleep(1500);
  console.log('   Starting fresh API …');
  const apiProc = spawn(
    'pnpm',
    ['--filter', '@hd-cpo/api', 'dev:noembedded'],
    {
      cwd: process.cwd(),
      env: { ...process.env, REDIS_URL: 'mock://' },
      stdio: 'pipe',
      shell: true,
    },
  );
  apiProc.stdout?.on('data', (d) => process.stderr.write(`[api] ${d}`));
  apiProc.stderr?.on('data', (d) => process.stderr.write(`[api-err] ${d}`));
  console.log('   Waiting for /health …');
  const up = await waitForApiUp();
  ok('API restarted and healthy', up);
  if (!up) {
    apiProc.kill();
    process.exit(1);
  }

  console.log('\n=== Step 3: Refresh with PRE-restart token ===');
  const refresh = await postJson('/auth/refresh', { refreshToken });
  ok(
    'refresh accepted across restart (NOT TOKEN_REUSED)',
    refresh.status === 200,
    `status=${refresh.status} code=${refresh.body?.error?.code ?? 'n/a'}`,
  );
  ok('new access token issued', !!refresh.body?.accessToken);
  ok('new refresh token issued', !!refresh.body?.refreshToken);

  if (refresh.status === 200) {
    console.log('\n=== Step 4: Use new access token on a protected route ===');
    const me = await getWithAuth('/auth/me', refresh.body.accessToken);
    ok('GET /auth/me returns 200 with new access token', me.status === 200, `status=${me.status}`);
  }

  console.log('\n=== Cleanup: kill spawned API ===');
  apiProc.kill();
  await sleep(500);

  console.log('\n=== Done ===');
  if (process.exitCode === 1) {
    console.log('\n❌ One or more assertions failed.');
  } else {
    console.log('\n✅ Restart tolerance verified — the demo "15-20 min logout" bug is fixed.');
  }
  process.exit(process.exitCode ?? 0);
})().catch((e) => {
  console.error('Test run errored:', e);
  process.exit(1);
});
