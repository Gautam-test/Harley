/**
 * Auth-service unit tests focused on the 12-hour session ceiling, refresh-
 * token rotation, and the restart-tolerance fix added to address the QA
 * "session expires after 15-20 min" report.
 *
 * Database access is stubbed via vi.mock so these tests do not need a live
 * Postgres. Redis uses the in-process ioredis-mock that the API already
 * loads when REDIS_URL=mock://, so refresh-jti rotation behaves exactly
 * like production with real Redis.
 */
import { describe, expect, it, beforeAll, beforeEach, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://x:y@localhost:5432/z';
  process.env.REDIS_URL = 'mock://';
  process.env.JWT_ACCESS_SECRET = 'a'.repeat(64);
  process.env.JWT_REFRESH_SECRET = 'b'.repeat(64);
  process.env.OTP_VERIFIED_TOKEN_SECRET = 'c'.repeat(32);
  process.env.PII_ENCRYPTION_KEY = 'test-pii-encryption-key-1234567890';
  // 12-hour session, 15-min access — production defaults.
  process.env.JWT_ACCESS_TTL_SECONDS = '900';
  process.env.JWT_REFRESH_TTL_SECONDS = String(12 * 60 * 60);
});

const dealerRow = {
  id: 'dealer-1',
  username: 'gurgaon-hd',
  email: 'sales@capital-hd.example.in',
  passwordHash: '', // populated in beforeAll-async via bcrypt.hash
  name: 'Capital HD',
  status: 'ACTIVE' as const,
};
const adminRow = {
  id: 'admin-1',
  email: 'admin@hd-cpo.local',
  passwordHash: '',
  name: 'H-D Admin',
};

vi.mock('../../config/prisma.js', () => ({
  prisma: {
    dealer: {
      findUnique: vi.fn(async ({ where }: { where: { username: string } }) =>
        where.username === dealerRow.username ? dealerRow : null,
      ),
      // QA: dealerLogin switched from findUnique({where:{username}}) →
      // findFirst({where:{OR:[{email},{username}]}}) so dealers can log
      // in with either credential. Mock matches against both fields.
      findFirst: vi.fn(
        async ({
          where,
        }: {
          where: { OR: Array<{ email?: { equals: string } | string; username?: string }> };
        }) => {
          const wants = where.OR.flatMap((c) => {
            const e = typeof c.email === 'string' ? c.email : c.email?.equals;
            return [e, c.username].filter((v): v is string => Boolean(v));
          });
          return wants.includes(dealerRow.username) ||
            wants.includes(dealerRow.email.toLowerCase())
            ? dealerRow
            : null;
        },
      ),
    },
    adminUser: {
      findUnique: vi.fn(async ({ where }: { where: { email: string } }) =>
        where.email === adminRow.email ? adminRow : null,
      ),
    },
  },
}));

beforeAll(async () => {
  dealerRow.passwordHash = await bcrypt.hash('Dealer@123!', 4);
  adminRow.passwordHash = await bcrypt.hash('Admin@123!', 4);
});

beforeEach(async () => {
  // Wipe ioredis-mock between tests so revoke markers / jti keys don't leak.
  const { redis } = await import('../../config/redis.js');
  await redis.flushall();
});

describe('issued tokens (login)', () => {
  it('dealer login returns tokens with sessionExpiresAt = now + 12h', async () => {
    const { dealerLogin } = await import('./auth.service.js');
    const before = Date.now();
    const res = await dealerLogin('gurgaon-hd', 'Dealer@123!');
    const after = Date.now();
    expect(res.accessToken).toBeTypeOf('string');
    expect(res.refreshToken).toBeTypeOf('string');
    // sessionExpiresAt should be 12h ± a few hundred ms from login time.
    const twelveHoursMs = 12 * 60 * 60 * 1000;
    expect(res.sessionExpiresAt).toBeGreaterThanOrEqual(before + twelveHoursMs - 1500);
    expect(res.sessionExpiresAt).toBeLessThanOrEqual(after + twelveHoursMs + 1500);
  });

  it('access token TTL is exactly 15 min (no session-cap effect at login)', async () => {
    const { dealerLogin } = await import('./auth.service.js');
    const res = await dealerLogin('gurgaon-hd', 'Dealer@123!');
    const at = jwt.decode(res.accessToken) as { iat: number; exp: number };
    expect(at.exp - at.iat).toBe(900);
  });

  it('refresh token carries an immutable `ses` claim equal to login time', async () => {
    const { dealerLogin } = await import('./auth.service.js');
    const before = Math.floor(Date.now() / 1000);
    const res = await dealerLogin('gurgaon-hd', 'Dealer@123!');
    const after = Math.floor(Date.now() / 1000);
    const rt = jwt.decode(res.refreshToken) as { ses: number; iat: number };
    expect(rt.ses).toBeGreaterThanOrEqual(before);
    expect(rt.ses).toBeLessThanOrEqual(after);
  });

  it('admin login also issues sessionExpiresAt + ses-bearing refresh token', async () => {
    const { adminLogin } = await import('./auth.service.js');
    const res = await adminLogin('admin@hd-cpo.local', 'Admin@123!');
    expect(res.sessionExpiresAt).toBeTypeOf('number');
    const rt = jwt.decode(res.refreshToken) as { ses: number };
    expect(rt.ses).toBeTypeOf('number');
  });
});

describe('refresh-token rotation', () => {
  it('issues a fresh access token + a NEW refresh token (jti rotated)', async () => {
    const { dealerLogin, refreshAccessToken } = await import('./auth.service.js');
    const login = await dealerLogin('gurgaon-hd', 'Dealer@123!');
    // Sleep past the next epoch-second tick so jwt.sign emits a different
    // `iat` and the rotated tokens differ byte-for-byte. (Within the same
    // second the access token would be identical because we sign the same
    // claims — the jti rotation is what we actually care about.)
    await new Promise((r) => setTimeout(r, 1100));
    const refreshed = await refreshAccessToken(login.refreshToken);

    expect(refreshed.accessToken).not.toBe(login.accessToken);
    expect(refreshed.refreshToken).not.toBe(login.refreshToken);

    const oldJti = (jwt.decode(login.refreshToken) as { jti: string }).jti;
    const newJti = (jwt.decode(refreshed.refreshToken) as { jti: string }).jti;
    expect(newJti).not.toBe(oldJti);
  });

  it('slides sessionExpiresAt forward on each refresh (24h-since-activity mode)', async () => {
    // ENH-001 sliding override: client switched from hard 24h cap to
    // "24h since last activity". Each refresh resets the ceiling to
    // now + JWT_REFRESH_TTL_SECONDS so an active user never gets a
    // mid-shift logout.
    const { dealerLogin, refreshAccessToken } = await import('./auth.service.js');
    const login = await dealerLogin('gurgaon-hd', 'Dealer@123!');
    // Long enough wall-clock advance to be visible in epoch-seconds.
    await new Promise((r) => setTimeout(r, 1100));
    const refreshed = await refreshAccessToken(login.refreshToken);
    expect(refreshed.sessionExpiresAt).toBeGreaterThan(login.sessionExpiresAt);
  });

  it('slides ses forward on each refresh', async () => {
    const { dealerLogin, refreshAccessToken } = await import('./auth.service.js');
    const login = await dealerLogin('gurgaon-hd', 'Dealer@123!');
    const loginSes = (jwt.decode(login.refreshToken) as { ses: number }).ses;
    await new Promise((r) => setTimeout(r, 1100));
    const refreshed = await refreshAccessToken(login.refreshToken);
    const newSes = (jwt.decode(refreshed.refreshToken) as { ses: number }).ses;
    expect(newSes).toBeGreaterThan(loginSes);
  });

  it('refresh-token TTL resets to the full window on each rotation (sliding mode)', async () => {
    const { dealerLogin, refreshAccessToken } = await import('./auth.service.js');
    const login = await dealerLogin('gurgaon-hd', 'Dealer@123!');
    await new Promise((r) => setTimeout(r, 1100)); // advance clock ~1s
    const refreshed = await refreshAccessToken(login.refreshToken);
    const rt = jwt.decode(refreshed.refreshToken) as { iat: number; exp: number };
    // ENH-001 sliding mode: after the rotation, ses is now → the new
    // refresh-token TTL equals the full configured window (12h here, set
    // via env at top of file). Allow ±2 s wiggle for issued-at jitter.
    const remaining = rt.exp - rt.iat;
    expect(remaining).toBeGreaterThanOrEqual(12 * 60 * 60 - 2);
    expect(remaining).toBeLessThanOrEqual(12 * 60 * 60 + 2);
  });
});

describe('refresh-token reuse detect', () => {
  it('rejects re-using the same refresh token twice (revokes all sessions)', async () => {
    const { dealerLogin, refreshAccessToken } = await import('./auth.service.js');
    const login = await dealerLogin('gurgaon-hd', 'Dealer@123!');
    // First refresh succeeds and rotates the jti.
    await refreshAccessToken(login.refreshToken);
    // Second call with the SAME token — must trigger reuse-detect.
    await expect(refreshAccessToken(login.refreshToken)).rejects.toMatchObject({
      status: 401,
      code: 'TOKEN_REUSED',
    });
  });

  it('after reuse-detect, the rotated token is ALSO revoked (sibling jti)', async () => {
    const { dealerLogin, refreshAccessToken } = await import('./auth.service.js');
    const login = await dealerLogin('gurgaon-hd', 'Dealer@123!');
    const rotated = await refreshAccessToken(login.refreshToken);
    // Trigger reuse on the original — should revoke ALL active jtis incl rotated.
    await expect(refreshAccessToken(login.refreshToken)).rejects.toMatchObject({
      code: 'TOKEN_REUSED',
    });
    // Now the rotated (legitimate) token must also be rejected.
    await expect(refreshAccessToken(rotated.refreshToken)).rejects.toMatchObject({
      status: 401,
    });
  });
});

describe('restart tolerance — refresh-jti absent because Redis state was lost', () => {
  it('accepts a refresh whose jti is absent IF iat < process-start (restart-orphan)', async () => {
    // Mint a refresh token directly with iat in the deep past — simulates a
    // token issued by a previous process whose mock-Redis state didn't survive.
    // No matching rt-jti key exists in Redis. The new restart-tolerance branch
    // should accept it instead of triggering reuse-detect.
    const { refreshAccessToken } = await import('./auth.service.js');
    const longAgo = Math.floor(Date.now() / 1000) - 3600; // 1h ago
    const orphanToken = jwt.sign(
      {
        sub: dealerRow.id,
        role: 'DEALER',
        name: dealerRow.name,
        jti: 'jti-from-previous-process',
        ses: longAgo,
        iat: longAgo,
      },
      process.env.JWT_REFRESH_SECRET!,
      { expiresIn: 11 * 60 * 60 }, // ~11h left in the session
    );
    const refreshed = await refreshAccessToken(orphanToken);
    expect(refreshed.accessToken).toBeTypeOf('string');
    expect(refreshed.refreshToken).toBeTypeOf('string');
  });

  it('STILL revokes when an in-process-issued token comes back missing (real reuse)', async () => {
    // A fresh login + rotate. The rotated refresh token has iat >= process
    // start (since this process issued it). Tampering with Redis to remove
    // its jti simulates an attacker trying to replay it after the legitimate
    // user's first use — must trigger reuse-detect.
    const { dealerLogin, refreshAccessToken } = await import('./auth.service.js');
    const { redis } = await import('../../config/redis.js');
    const login = await dealerLogin('gurgaon-hd', 'Dealer@123!');
    // Manually delete the jti key as if an attacker raced with us.
    const jti = (jwt.decode(login.refreshToken) as { jti: string }).jti;
    await redis.del(`auth:rt:${dealerRow.id}:${jti}`);
    await expect(refreshAccessToken(login.refreshToken)).rejects.toMatchObject({
      code: 'TOKEN_REUSED',
    });
  });
});

describe('session ceiling (12h hard cap)', () => {
  it('rejects refresh whose ses + 12h <= now with SESSION_EXPIRED', async () => {
    const { refreshAccessToken } = await import('./auth.service.js');
    const veryLongAgo = Math.floor(Date.now() / 1000) - (13 * 60 * 60); // 13h ago
    const expiredSessionToken = jwt.sign(
      {
        sub: dealerRow.id,
        role: 'DEALER',
        name: dealerRow.name,
        jti: 'old-jti',
        ses: veryLongAgo,
      },
      process.env.JWT_REFRESH_SECRET!,
      { expiresIn: 14 * 60 * 60 }, // JWT itself still valid (signature-wise)
    );
    await expect(refreshAccessToken(expiredSessionToken)).rejects.toMatchObject({
      status: 401,
      code: 'SESSION_EXPIRED',
    });
  });
});

describe('invalid refresh tokens', () => {
  it('rejects malformed JWT', async () => {
    const { refreshAccessToken } = await import('./auth.service.js');
    await expect(refreshAccessToken('not.a.valid.jwt')).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_REFRESH_TOKEN',
    });
  });

  it('rejects token signed with a different secret', async () => {
    const { refreshAccessToken } = await import('./auth.service.js');
    const wrongSecretToken = jwt.sign(
      { sub: dealerRow.id, role: 'DEALER', name: 'x', jti: 'x', ses: Math.floor(Date.now() / 1000) },
      'a-wrong-secret-of-sufficient-length-12345',
      { expiresIn: 60 },
    );
    await expect(refreshAccessToken(wrongSecretToken)).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
    });
  });

  it('rejects legacy refresh token without jti', async () => {
    const { refreshAccessToken } = await import('./auth.service.js');
    const legacyToken = jwt.sign(
      { sub: dealerRow.id, role: 'DEALER', name: 'x' },
      process.env.JWT_REFRESH_SECRET!,
      { expiresIn: 60 },
    );
    await expect(refreshAccessToken(legacyToken)).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_REFRESH_TOKEN',
    });
  });
});

describe('login error paths', () => {
  it('rejects unknown dealer username with INVALID_CREDENTIALS', async () => {
    const { dealerLogin } = await import('./auth.service.js');
    await expect(dealerLogin('does-not-exist', 'whatever')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('rejects wrong dealer password with INVALID_CREDENTIALS', async () => {
    const { dealerLogin } = await import('./auth.service.js');
    await expect(dealerLogin('gurgaon-hd', 'WrongPassword')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
  });
});
