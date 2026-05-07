import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getEnv } from '../../config/env.js';
import { prisma } from '../../config/prisma.js';
import { redis } from '../../config/redis.js';
import { logger } from '../../config/logger.js';
import { HttpError } from '../../middleware/error-handler.js';
import type { AuthClaims } from '../../middleware/auth.js';

const env = getEnv();

interface RefreshClaims extends AuthClaims {
  /** Unique per refresh token; consumed once on /auth/refresh and rotated. */
  jti: string;
}

// Refresh-token rotation lives in Redis. Each freshly-issued refresh token's
// jti is stored as `auth:rt:<sub>:<jti>` with TTL matching the JWT exp. On
// /auth/refresh:
//   - we verify the JWT signature
//   - we DEL the jti key — if DEL returns 0 the token has either expired or
//     been used already. Re-using a refresh token signals theft, so we
//     revoke EVERY active refresh token for that subject (`auth:rt:<sub>:*`)
//     by writing a global revocation marker.
//   - we issue a fresh access token + a fresh refresh token with a new jti
const rtKey = (sub: string, jti: string) => `auth:rt:${sub}:${jti}`;
const rtRevokeAllKey = (sub: string) => `auth:rt-revoked:${sub}`;

async function persistRefreshJti(sub: string, jti: string) {
  // SETNX so a collision (vanishingly unlikely with v4 UUID) doesn't
  // silently overwrite an unrelated token.
  await redis.set(rtKey(sub, jti), '1', 'EX', env.JWT_REFRESH_TTL_SECONDS, 'NX');
}

function signAccess(claims: AuthClaims): string {
  return jwt.sign(claims, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_TTL_SECONDS });
}

function signRefresh(claims: AuthClaims, jti: string): string {
  return jwt.sign({ ...claims, jti }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_TTL_SECONDS,
  });
}

async function issueTokens(claims: AuthClaims) {
  const jti = randomUUID();
  await persistRefreshJti(claims.sub, jti);
  return { accessToken: signAccess(claims), refreshToken: signRefresh(claims, jti) };
}

export async function dealerLogin(username: string, password: string) {
  const dealer = await prisma.dealer.findUnique({ where: { username } });
  // Step 1: existence + password — generic message keeps the username-
  // enumeration surface flat (an attacker can't tell whether the username
  // exists by comparing error text).
  if (!dealer) {
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid username or password');
  }
  const ok = await bcrypt.compare(password, dealer.passwordHash);
  if (!ok) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid username or password');

  // Step 2: status. Only reach this branch when credentials are valid,
  // so a tailored message doesn't leak any signal a username-enumerator
  // couldn't already get from a successful auth attempt with their own
  // password. Suspended / inactive dealers get a clear reason instead
  // of the misleading "Invalid username or password" they used to see.
  if (dealer.status === 'SUSPENDED') {
    throw new HttpError(
      403,
      'ACCOUNT_SUSPENDED',
      'Your account is suspended. Contact your H-D Certified admin to restore access.',
    );
  }
  if (dealer.status === 'INACTIVE') {
    throw new HttpError(
      403,
      'ACCOUNT_INACTIVE',
      'Your account is inactive. Contact your H-D Certified admin to activate it.',
    );
  }

  const claims: AuthClaims = { sub: dealer.id, role: 'DEALER', name: dealer.name };
  // Lifting any stale revocation marker from a prior compromise — a fresh
  // password-based login is the explicit recovery action.
  await redis.del(rtRevokeAllKey(dealer.id));
  return {
    ...(await issueTokens(claims)),
    user: { id: dealer.id, role: 'DEALER' as const, name: dealer.name },
  };
}

export async function adminLogin(email: string, password: string) {
  const admin = await prisma.adminUser.findUnique({ where: { email } });
  if (!admin) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  const ok = await bcrypt.compare(password, admin.passwordHash);
  if (!ok) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');

  const claims: AuthClaims = { sub: admin.id, role: 'ADMIN', name: admin.name };
  await redis.del(rtRevokeAllKey(admin.id));
  return {
    ...(await issueTokens(claims)),
    user: { id: admin.id, role: 'ADMIN' as const, name: admin.name },
  };
}

export async function refreshAccessToken(refreshToken: string) {
  let claims: RefreshClaims;
  try {
    claims = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as RefreshClaims;
  } catch {
    throw new HttpError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token invalid or expired');
  }
  if (!claims.jti) {
    // Legacy refresh tokens minted before rotation rolled out — reject so
    // every client is forced to log in once and pick up the new format.
    throw new HttpError(401, 'INVALID_REFRESH_TOKEN', 'Token format is out of date — please sign in again');
  }
  if (await redis.get(rtRevokeAllKey(claims.sub))) {
    throw new HttpError(401, 'TOKEN_REVOKED', 'All sessions for this account have been revoked');
  }

  // DEL returns 1 if the key existed, 0 if not. A "0" here means either:
  //   (a) the token's TTL passed (legitimate expiry), OR
  //   (b) the token was already used — i.e. someone (possibly the legitimate
  //       user, possibly an attacker) refreshed with this exact jti before.
  // We can't tell which from signature alone, so the safe move is to revoke
  // every active refresh token for this subject AND every sibling jti
  // already issued (e.g. the rotated token from the legitimate first
  // refresh) so the attacker's freshly-issued token is also invalidated.
  const removed = await redis.del(rtKey(claims.sub, claims.jti));
  if (removed === 0) {
    // Set the global revocation marker first, then proactively delete
    // every per-jti key for this subject. SCAN is used (not KEYS) so we
    // don't block redis on accounts with many active sessions.
    await redis.set(rtRevokeAllKey(claims.sub), '1', 'EX', env.JWT_REFRESH_TTL_SECONDS);
    try {
      const pattern = `auth:rt:${claims.sub}:*`;
      let cursor = '0';
      do {
        const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = next;
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      } while (cursor !== '0');
    } catch (e) {
      logger.warn({ err: e, sub: claims.sub }, 'Sibling-jti cleanup failed during reuse-detect');
    }
    logger.warn(
      { sub: claims.sub, jti: claims.jti },
      'Refresh-token reuse detected — revoked all active sessions + sibling jtis',
    );
    throw new HttpError(401, 'TOKEN_REUSED', 'Refresh token already used; please sign in again');
  }

  const next: AuthClaims = { sub: claims.sub, role: claims.role, name: claims.name };
  return await issueTokens(next);
}
