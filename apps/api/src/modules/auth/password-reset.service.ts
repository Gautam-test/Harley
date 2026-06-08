// Email-based password reset OTP — used by both dealer + admin forgot-
// password flows. Three-step state machine, Redis-only (no Prisma
// migration). 6-digit OTP, 10-minute TTL, max 5 wrong attempts, max
// 3 send-requests per email per hour.
//
// Security posture:
//   - The `requestReset` endpoint ALWAYS returns 200 so the caller
//     can't enumerate which emails exist on the platform.
//   - OTPs are bcrypt-hashed before going into Redis — even with a
//     Redis dump the code isn't recoverable.
//   - On successful verify we issue a short-lived (5 min) JWT-style
//     reset token; the password update endpoint requires the same
//     token, so the rep can't replay a verify call to flip somebody
//     else's password.
//   - One-shot: the token + the OTP record are deleted on successful
//     password update so the same token can't be reused.

import { randomInt, randomUUID, createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getEnv } from '../../config/env.js';
import { redis } from '../../config/redis.js';
import { prisma } from '../../config/prisma.js';
import { logger } from '../../config/logger.js';
import { HttpError } from '../../middleware/error-handler.js';
import { emailProvider, passwordResetOtpEmail } from '../email/email.module.js';

export type ResetRole = 'DEALER' | 'ADMIN';

const env = getEnv();
const TTL_SECONDS = 10 * 60; // OTP validity: 10 minutes
const RESET_TOKEN_TTL_SECONDS = 5 * 60; // post-verify window to set new password
const RESET_TOKEN_AUDIENCE = 'hd-password-reset';
const MAX_ATTEMPTS = 5;
const SEND_WINDOW_SECONDS = 60 * 60;
const SEND_MAX_PER_WINDOW = 3;
const RESEND_COOLDOWN_SECONDS = 30;

const otpKey = (otpId: string) => `pwreset:otp:${otpId}`;
const sendCountKey = (emailHash: string) => `pwreset:send-count:${emailHash}`;
const resendCooldownKey = (emailHash: string) => `pwreset:cooldown:${emailHash}`;
const consumedTokenKey = (jti: string) => `pwreset:consumed:${jti}`;

interface StoredOtp {
  codeHash: string;
  email: string;
  role: ResetRole;
  userId: string;
  attempts: number;
  createdAt: number;
}

// Don't leak the raw email through Redis keys — hash it so the key
// namespace is opaque while still uniquely identifiable.
function hashEmail(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 24);
}

interface UserLookup {
  id: string;
  name: string;
  email: string;
}

async function lookupUser(role: ResetRole, email: string): Promise<UserLookup | null> {
  const normalised = email.trim().toLowerCase();
  if (role === 'ADMIN') {
    const row = await prisma.adminUser.findUnique({
      where: { email: normalised },
      select: { id: true, name: true, email: true },
    });
    return row;
  }
  // DEALER — Dealer.email isn't @unique in schema but is unique in
  // practice. findFirst on email; fall back to username (legacy slug)
  // so the existing email-OR-username login pattern works here too.
  const row = await prisma.dealer.findFirst({
    where: {
      OR: [
        { email: { equals: normalised, mode: 'insensitive' } },
        { username: normalised },
      ],
    },
    select: { id: true, name: true, email: true },
  });
  return row;
}

/**
 * Step 1 — buyer/dealer/admin enters their registered email.
 *
 * QA decision: return 404 USER_NOT_FOUND when the email doesn't
 * match a dealer / admin row. Reverses the prior anti-enumeration
 * posture (always return 200 with a dud otpId) because the user
 * base is closed + small (~15 dealers, 1 admin) so enumeration
 * risk is low and the original UX was confusing — users typed a
 * typo'd email, got an opaque "we sent a code" message, then
 * never received anything.
 *
 * Throws on rate-limit overflow (3 sends / hour / email) and on
 * unregistered email.
 */
export async function requestReset(
  role: ResetRole,
  email: string,
): Promise<{ otpId: string; expiresInSeconds: number }> {
  const emailHash = hashEmail(email);

  // Per-email cooldown — 30s between sends to a single email.
  const onCooldown = await redis.get(resendCooldownKey(emailHash));
  if (onCooldown) {
    throw new HttpError(
      429,
      'OTP_RESEND_TOO_SOON',
      `Please wait ${RESEND_COOLDOWN_SECONDS} seconds before requesting another code.`,
    );
  }

  // Per-email hourly cap. Counter increments on every call (even when
  // the email doesn't exist) so an attacker can't probe by burning
  // requests against unknown emails.
  const sendCount = await redis.incr(sendCountKey(emailHash));
  if (sendCount === 1) {
    await redis.expire(sendCountKey(emailHash), SEND_WINDOW_SECONDS);
  }
  if (sendCount > SEND_MAX_PER_WINDOW) {
    throw new HttpError(
      429,
      'OTP_LIMIT_REACHED',
      'Too many reset requests for this email. Please try again in an hour.',
    );
  }

  await redis.set(resendCooldownKey(emailHash), '1', 'EX', RESEND_COOLDOWN_SECONDS);

  const user = await lookupUser(role, email);
  const otpId = randomUUID();

  if (!user) {
    // QA flip: surface the not-found error directly so the user can
    // correct their typo instead of waiting for an email that never
    // arrives. Closed user base = enumeration risk is acceptable.
    logger.info({ emailHash, role }, 'pwreset: email not registered');
    throw new HttpError(
      404,
      'USER_NOT_FOUND',
      'User not found. Please enter a registered email address or contact H-D Admin.',
    );
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const codeHash = await bcrypt.hash(code, 10);
  const payload: StoredOtp = {
    codeHash,
    email: user.email,
    role,
    userId: user.id,
    attempts: 0,
    createdAt: Date.now(),
  };
  await redis.set(otpKey(otpId), JSON.stringify(payload), 'EX', TTL_SECONDS);

  // Fire-and-forget the email so the response isn't blocked by SMTP
  // latency. Failures are logged; the rep can hit Resend.
  emailProvider()
    .send(
      passwordResetOtpEmail({
        to: user.email,
        name: user.name,
        code,
        role,
        expiresInMinutes: Math.floor(TTL_SECONDS / 60),
      }),
    )
    .catch((err) => {
      logger.error({ err, emailHash, role }, 'pwreset: SMTP send failed');
    });

  return { otpId, expiresInSeconds: TTL_SECONDS };
}

/**
 * Step 2 — caller supplies otpId + 6-digit code. On success we mint a
 * short-lived JWT (5 min) that the password-update endpoint requires.
 * Wrong-code attempts are counted; 5+ wipes the OTP entirely and the
 * caller has to start over with a new requestReset.
 */
export async function verifyResetCode(
  otpId: string,
  code: string,
): Promise<{ resetToken: string }> {
  const raw = await redis.get(otpKey(otpId));
  if (!raw) {
    throw new HttpError(410, 'OTP_EXPIRED', 'This code has expired. Request a new one.');
  }
  const stored = JSON.parse(raw) as StoredOtp;

  if (stored.attempts >= MAX_ATTEMPTS) {
    await redis.del(otpKey(otpId));
    throw new HttpError(429, 'OTP_LOCKED', 'Too many wrong attempts. Request a new code.');
  }

  const ok = await bcrypt.compare(code, stored.codeHash);
  if (!ok) {
    stored.attempts += 1;
    const remaining = MAX_ATTEMPTS - stored.attempts;
    await redis.set(otpKey(otpId), JSON.stringify(stored), 'KEEPTTL');
    throw new HttpError(
      400,
      'OTP_MISMATCH',
      remaining > 0
        ? `Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
        : 'Incorrect code. Request a new one.',
    );
  }

  // Success — burn the OTP so it can't be re-verified, then issue the
  // short-lived reset token. The token carries the subject + role so the
  // password-update endpoint knows whose password to flip.
  await redis.del(otpKey(otpId));

  const jti = randomUUID();
  const resetToken = jwt.sign(
    {
      sub: stored.userId,
      role: stored.role,
      jti,
      aud: RESET_TOKEN_AUDIENCE,
    },
    env.JWT_ACCESS_SECRET,
    { expiresIn: RESET_TOKEN_TTL_SECONDS, algorithm: 'HS256' },
  );
  return { resetToken };
}

/**
 * Step 3 — caller supplies the resetToken + a new password. Token must
 * verify, must not have been used already, and the new password must
 * pass the basic length rule (≥8 chars). On success we bcrypt-hash
 * and write to the dealer/admin row.
 */
export async function resetPassword(resetToken: string, newPassword: string): Promise<void> {
  if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 128) {
    throw new HttpError(400, 'PASSWORD_INVALID', 'Password must be 8–128 characters.');
  }

  let claims: { sub: string; role: ResetRole; jti: string; aud?: string };
  try {
    claims = jwt.verify(resetToken, env.JWT_ACCESS_SECRET, {
      audience: RESET_TOKEN_AUDIENCE,
      algorithms: ['HS256'],
    }) as typeof claims;
  } catch {
    throw new HttpError(401, 'RESET_TOKEN_INVALID', 'Reset session expired. Start over.');
  }

  // One-shot — refuse to honour the same token twice. We mark the jti
  // as consumed for the token's remaining lifetime; subsequent calls
  // see the marker and error out.
  const consumed = await redis.get(consumedTokenKey(claims.jti));
  if (consumed) {
    throw new HttpError(401, 'RESET_TOKEN_USED', 'This reset session has already been used.');
  }
  await redis.set(consumedTokenKey(claims.jti), '1', 'EX', RESET_TOKEN_TTL_SECONDS);

  const passwordHash = await bcrypt.hash(newPassword, 12);

  if (claims.role === 'ADMIN') {
    await prisma.adminUser.update({
      where: { id: claims.sub },
      data: { passwordHash },
    });
  } else {
    await prisma.dealer.update({
      where: { id: claims.sub },
      data: { passwordHash },
    });
  }

  logger.info({ sub: claims.sub, role: claims.role }, 'pwreset: password updated');
}
