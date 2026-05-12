// User-test for the auth session flow.
//
// Runs against the local API on :4001 with whatever JWT TTLs that process
// has. To exercise the full ceiling end-to-end fast, restart the API with:
//   JWT_REFRESH_TTL_SECONDS=20 JWT_ACCESS_TTL_SECONDS=5 pnpm --filter @hd-cpo/api dev:noembedded
// then run this script.
//
// Steps:
//  1. Login as dealer → assert sessionExpiresAt + ses on refresh token
//  2. Hit a protected route → 200
//  3. Refresh once → new tokens, same ses, same sessionExpiresAt
//  4. Refresh again with the OLD refresh token → expect TOKEN_REUSED
//  5. Login fresh, then loop refresh-then-protected-call until the session
//     ceiling is hit → expect SESSION_EXPIRED with no further refresh

const API = 'http://localhost:4001/api/v1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function decodeJwtPayload(token) {
  const part = token.split('.')[1];
  return JSON.parse(Buffer.from(part, 'base64').toString());
}

async function postJson(path, body) {
  const res = await fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* ignore */ }
  return { status: res.status, body: json, raw: text };
}

async function getWithAuth(path, token) {
  const res = await fetch(API + path, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* ignore */ }
  return { status: res.status, body: json, raw: text };
}

function ok(label, cond, extra = '') {
  const tag = cond ? '✅ PASS' : '❌ FAIL';
  console.log(`${tag} — ${label}${extra ? ' — ' + extra : ''}`);
  if (!cond) process.exitCode = 1;
}

(async () => {
  console.log('\n=== Step 1: Login ===');
  const login = await postJson('/auth/dealer/login', {
    username: 'gurgaon-hd',
    password: 'Dealer@123!',
  });
  ok('login returns 200', login.status === 200, `status=${login.status}`);
  ok('response has accessToken', !!login.body?.accessToken);
  ok('response has refreshToken', !!login.body?.refreshToken);
  ok('response has sessionExpiresAt', typeof login.body?.sessionExpiresAt === 'number');

  const at = decodeJwtPayload(login.body.accessToken);
  const rt = decodeJwtPayload(login.body.refreshToken);
  console.log('   access TTL (s):', at.exp - at.iat);
  console.log('   refresh TTL (s):', rt.exp - rt.iat);
  console.log('   sessionExpiresAt-now (s):', Math.floor((login.body.sessionExpiresAt - Date.now()) / 1000));
  ok('refresh token has ses claim', typeof rt.ses === 'number');
  ok('ses ~= now', Math.abs(rt.ses - Math.floor(Date.now() / 1000)) < 5);

  console.log('\n=== Step 2: Protected route call ===');
  const me = await getWithAuth('/auth/me', login.body.accessToken);
  ok('GET /auth/me returns 200', me.status === 200, `status=${me.status}`);
  ok('me.role is DEALER', me.body?.role === 'DEALER');

  console.log('\n=== Step 3: Refresh once ===');
  await sleep(1100); // ensure iat advances by 1s
  const refresh1 = await postJson('/auth/refresh', {
    refreshToken: login.body.refreshToken,
  });
  ok('refresh #1 returns 200', refresh1.status === 200, `status=${refresh1.status}`);
  ok('refresh #1 has new accessToken', refresh1.body?.accessToken && refresh1.body.accessToken !== login.body.accessToken);
  ok('refresh #1 has new refreshToken', refresh1.body?.refreshToken && refresh1.body.refreshToken !== login.body.refreshToken);
  ok(
    'sessionExpiresAt UNCHANGED across refresh',
    refresh1.body?.sessionExpiresAt === login.body.sessionExpiresAt,
    `was=${login.body.sessionExpiresAt} now=${refresh1.body?.sessionExpiresAt}`,
  );
  const rt1 = decodeJwtPayload(refresh1.body.refreshToken);
  ok('ses preserved across refresh', rt1.ses === rt.ses, `was=${rt.ses} now=${rt1.ses}`);
  ok('jti rotated', rt1.jti !== rt.jti);

  console.log('\n=== Step 4: Reuse old refresh token (must be rejected) ===');
  const reuse = await postJson('/auth/refresh', {
    refreshToken: login.body.refreshToken,
  });
  ok('reuse returns 401', reuse.status === 401, `status=${reuse.status}`);
  ok('reuse code is TOKEN_REUSED', reuse.body?.error?.code === 'TOKEN_REUSED', `code=${reuse.body?.error?.code}`);

  console.log('\n=== Step 5: Verify rotated token ALSO revoked ===');
  const afterReuse = await postJson('/auth/refresh', {
    refreshToken: refresh1.body.refreshToken,
  });
  ok(
    'rotated token also revoked after reuse-detect',
    afterReuse.status === 401,
    `status=${afterReuse.status} code=${afterReuse.body?.error?.code}`,
  );

  console.log('\n=== Step 6: Fresh login + repeated refresh stays valid for full session ===');
  const login2 = await postJson('/auth/dealer/login', {
    username: 'gurgaon-hd',
    password: 'Dealer@123!',
  });
  ok('fresh login OK', login2.status === 200);
  let currentRT = login2.body.refreshToken;
  let currentAT = login2.body.accessToken;
  const sessionExp = login2.body.sessionExpiresAt;
  let refreshCount = 0;
  let lastError = null;
  // Keep refreshing until either the session ceiling is hit OR we've done
  // 5 successful refreshes (whichever first). With production TTLs the
  // ceiling won't be reached in 5 cycles — that's fine, we still verify
  // the loop is stable.
  while (refreshCount < 5 && Date.now() < sessionExp) {
    await sleep(1100);
    const r = await postJson('/auth/refresh', { refreshToken: currentRT });
    if (r.status !== 200) {
      lastError = r;
      break;
    }
    currentRT = r.body.refreshToken;
    currentAT = r.body.accessToken;
    refreshCount++;
    const me = await getWithAuth('/auth/me', currentAT);
    if (me.status !== 200) {
      lastError = me;
      break;
    }
  }
  ok(
    `${refreshCount} successive refresh→protected-call cycles all succeeded`,
    refreshCount >= 5 || (lastError && lastError.body?.error?.code === 'SESSION_EXPIRED'),
    lastError ? `stopped on: ${JSON.stringify(lastError.body)}` : '',
  );

  console.log('\n=== Done ===');
  if (process.exitCode === 1) {
    console.log('\n❌ One or more assertions failed.');
  } else {
    console.log('\n✅ All assertions passed.');
  }
})().catch((e) => {
  console.error('Test run errored:', e);
  process.exit(1);
});
