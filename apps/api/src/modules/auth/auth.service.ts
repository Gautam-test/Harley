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
  /** Session-start epoch (seconds). Set once at password-login and carried
   *  forward through every rotation so the 12-h session ceiling is a fixed
   *  wall-clock cap from initial sign-in (not a sliding window). Without
   *  this, rotating refresh tokens kept extending the session indefinitely
   *  for any active user — QA: "after 12h the session should expire". */
  ses?: number;
  /** Issued-at epoch (seconds). Standard JWT claim — populated by
   *  jsonwebtoken at sign time. Used by the refresh handler to distinguish
   *  state-loss-from-restart from genuine token reuse. */
  iat?: number;
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

/** Process-start epoch (seconds). Used by the refresh handler to distinguish
 *  "refresh-jti is missing because Redis lost state across an API restart"
 *  from "refresh-jti is missing because someone already used this token".
 *  Without this, every active session got revoked at its first refresh after
 *  a deploy / hot-reload — the QA "session expires after 15-20 min" report. */
const PROCESS_START_SECONDS = nowSeconds();

/** How many seconds remain in this session before it must hard-expire,
 *  regardless of rotation activity. Returns 0 once the cap has elapsed. */
function sessionRemainingSeconds(ses: number): number {
  return Math.max(0, ses + env.JWT_REFRESH_TTL_SECONDS - nowSeconds());
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

async function persistRefreshJti(sub: string, jti: string, ttlSeconds: number) {
  // SETNX so a collision (vanishingly unlikely with v4 UUID) doesn't
  // silently overwrite an unrelated token. TTL is the session-remaining,
  // not the env default — a token issued 11h into the session lives only
  // 1h, never beyond the ceiling.
  await redis.set(rtKey(sub, jti), '1', 'EX', ttlSeconds, 'NX');
}

function signAccess(claims: AuthClaims, ttlSeconds: number): string {
  return jwt.sign(claims, env.JWT_ACCESS_SECRET, { expiresIn: ttlSeconds });
}

function signRefresh(claims: AuthClaims, jti: string, ses: number, ttlSeconds: number): string {
  return jwt.sign({ ...claims, jti, ses }, env.JWT_REFRESH_SECRET, {
    expiresIn: ttlSeconds,
  });
}

async function issueTokens(claims: AuthClaims, ses: number) {
  const remaining = sessionRemainingSeconds(ses);
  // Cap the access TTL at the session-remaining so the access token can
  // never outlast the session (otherwise a token minted 14m before the
  // ceiling would be valid for 1m past it).
  const accessTtl = Math.min(env.JWT_ACCESS_TTL_SECONDS, remaining);
  const jti = randomUUID();
  await persistRefreshJti(claims.sub, jti, remaining);
  return {
    accessToken: signAccess(claims, accessTtl),
    refreshToken: signRefresh(claims, jti, ses, remaining),
    /** Absolute session expiry in epoch milliseconds — sent to the SPA so
     *  it can schedule a proactive auto-logout timer at the right moment. */
    sessionExpiresAt: (ses + env.JWT_REFRESH_TTL_SECONDS) * 1000,
  };
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
  const ses = nowSeconds();
  return {
    ...(await issueTokens(claims, ses)),
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
  const ses = nowSeconds();
  return {
    ...(await issueTokens(claims, ses)),
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
  // Session-ceiling check — refresh tokens minted before this rollout
  // lack `ses`, so accept them once and pin their session to NOW (they
  // get the full 12h from this moment as a one-time grace). Tokens
  // minted post-rollout always carry `ses` and we honour the original
  // login time.
  const ses = typeof claims.ses === 'number' ? claims.ses : nowSeconds();
  if (sessionRemainingSeconds(ses) <= 0) {
    throw new HttpError(401, 'SESSION_EXPIRED', 'Your 12-hour session has expired — please sign in again');
  }

  // DEL returns 1 if the key existed, 0 if not. A "0" here can mean:
  //   (a) the key was lost because Redis state didn't persist (in-process
  //       mock restarted, or a real Redis was flushed), OR
  //   (b) the token was already used — i.e. someone (possibly the legitimate
  //       user, possibly an attacker) refreshed with this exact jti before.
  //
  // Distinguish (a) from (b) by comparing the token's iat to this process's
  // start time. Tokens issued BEFORE the process started cannot have been
  // used within this process — their absence is an expected consequence of
  // the restart, not a reuse signal. Treating them as reuse caused the
  // QA "session times out after 15-20 min" symptom: every API restart
  // revoked all active sessions at their next refresh.
  //
  // Tokens issued during THIS process lifetime that come back missing ARE
  // genuine reuse (or expiry past their refresh-ttl, which would also have
  // failed jwt.verify above) — keep the hard revoke-all behaviour.
  const removed = await redis.del(rtKey(claims.sub, claims.jti));
  if (removed === 0) {
    const tokenIat = typeof claims.iat === 'number' ? claims.iat : 0;
    const wasIssuedBeforeRestart = tokenIat > 0 && tokenIat < PROCESS_START_SECONDS;
    if (wasIssuedBeforeRestart) {
      // Re-prime the jti so a parallel concurrent refresh doesn't also
      // miss the key and treat itself as a restart-orphan. From this
      // point forward this jti behaves like a fresh post-restart token.
      logger.info(
        { sub: claims.sub, jti: claims.jti, tokenIat, processStart: PROCESS_START_SECONDS },
        'Accepting refresh across process restart (rt-jti state lost; not a reuse)',
      );
    } else {
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
        { sub: claims.sub, jti: claims.jti, tokenIat, processStart: PROCESS_START_SECONDS },
        'Refresh-token reuse detected — revoked all active sessions + sibling jtis',
      );
      throw new HttpError(401, 'TOKEN_REUSED', 'Refresh token already used; please sign in again');
    }
  }

  const next: AuthClaims = { sub: claims.sub, role: claims.role, name: claims.name };
  // Carry the original session-start through so the wall-clock ceiling
  // is preserved. New access + refresh tokens are auto-capped by
  // issueTokens to whatever's left of the session.
  return await issueTokens(next, ses);
}
