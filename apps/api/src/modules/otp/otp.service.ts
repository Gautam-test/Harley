import { randomInt, randomUUID, createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import type { OtpPurpose } from '@hd-cpo/types';
import { getEnv } from '../../config/env.js';
import { redis } from '../../config/redis.js';
import { HttpError } from '../../middleware/error-handler.js';
import { smsProvider } from '../sms/sms.module.js';

// PRD §6.1.4 OTP rules:
//   - 6 digits, expires in 5 minutes
//   - Max 5 attempts before lockout for 30 minutes
//   - Resend allowed after 30 seconds; max 3 resends per hour per phone

const env = getEnv();
const TTL_SECONDS = 5 * 60;
const RESEND_WINDOW_SECONDS = 30;
const RESEND_MAX_PER_HOUR = 3;
// Hard daily ceiling per phone — defends against carrier-cost abuse where
// a botnet spreads requests across IPs (defeating the per-IP limiter) but
// hammers the same target number. 10/day is generous for any legit user
// flow (a buyer enquiring on multiple bikes uses 1 OTP, not 10) but caps
// the worst-case spend per number per day.
const DAILY_MAX_PER_PHONE = 10;
const DAILY_WINDOW_SECONDS = 24 * 60 * 60;
const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 30 * 60;

interface StoredOtp {
  codeHash: string;
  phone: string;
  purpose: OtpPurpose;
  attempts: number;
  createdAt: number;
}

const otpKey = (id: string) => `otp:${id}`;
const lockoutKey = (phone: string) => `otp:lockout:${phone}`;
const resendKey = (phone: string) => `otp:resend:${phone}`;
const resendCounterKey = (phone: string) => `otp:resend-count:${phone}`;
const dailyCounterKey = (phone: string) => `otp:daily-count:${phone}`;
// QA RE-OPEN: reverse index from (phone, purpose) → otpId so a client
// that lost its otpId reference (modal unmounted between edit + resubmit)
// can rejoin an in-flight OTP without triggering RESEND_TOO_SOON. Keyed
// on purpose because the same phone can have one OTP for ENQUIRY and a
// separate one for TRADE_IN concurrently.
const activeOtpByPhoneKey = (phone: string, purpose: OtpPurpose) =>
  `otp:active:${phone}:${purpose}`;

export async function sendOtp(phone: string, purpose: OtpPurpose): Promise<{ otpId: string; expiresInSeconds: number }> {
  // Lockout check.
  const locked = await redis.get(lockoutKey(phone));
  if (locked) throw new HttpError(429, 'OTP_LOCKED', 'Too many failed attempts. Try again later.');

  // QA RE-OPEN bug #4 / #6: when a caller re-asks for an OTP for the
  // same (phone, purpose) within the resend window, return the EXISTING
  // otpId instead of throwing OTP_RESEND_TOO_SOON. This unblocks the
  // "Submit → Edit details → Resubmit" flow on the Sell Bike / Buyer
  // Enquiry forms — the user still has the SMS code from the first
  // send and just needs an otpId to verify against; no new SMS is
  // sent, no rate-limit counter incremented. The original 30s window
  // remains a hard SMS-spam guard for cases where the active OTP has
  // expired or been verified (entry removed from activeOtpByPhoneKey).
  const recent = await redis.get(resendKey(phone));
  if (recent) {
    const existingOtpId = await redis.get(activeOtpByPhoneKey(phone, purpose));
    if (existingOtpId) {
      const exists = await redis.get(otpKey(existingOtpId));
      if (exists) {
        return { otpId: existingOtpId, expiresInSeconds: TTL_SECONDS };
      }
    }
    throw new HttpError(429, 'OTP_RESEND_TOO_SOON', `Wait ${RESEND_WINDOW_SECONDS}s before resending`);
  }
  const counter = await redis.incr(resendCounterKey(phone));
  if (counter === 1) await redis.expire(resendCounterKey(phone), 3600);
  if (counter > RESEND_MAX_PER_HOUR) {
    throw new HttpError(429, 'OTP_RESEND_LIMIT', 'Too many OTPs requested for this number this hour');
  }

  // Daily ceiling — orthogonal to the hour bucket above. Stops a
  // distributed attack from spreading 30 OTP-sends across 30 hours and
  // running ₹30/day per number against MSG91. 10/day is well above any
  // legit user pattern.
  const dailyCount = await redis.incr(dailyCounterKey(phone));
  if (dailyCount === 1) await redis.expire(dailyCounterKey(phone), DAILY_WINDOW_SECONDS);
  if (dailyCount > DAILY_MAX_PER_PHONE) {
    throw new HttpError(
      429,
      'OTP_DAILY_LIMIT',
      'Daily OTP limit reached for this number — try again tomorrow or contact support',
    );
  }
  await redis.set(resendKey(phone), '1', 'EX', RESEND_WINDOW_SECONDS);

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const codeHash = await bcrypt.hash(code, 10);
  const otpId = randomUUID();
  const payload: StoredOtp = { codeHash, phone, purpose, attempts: 0, createdAt: Date.now() };
  await redis.set(otpKey(otpId), JSON.stringify(payload), 'EX', TTL_SECONDS);
  // Index entry — same TTL as the OTP so the reverse lookup expires
  // naturally with the OTP itself.
  await redis.set(activeOtpByPhoneKey(phone, purpose), otpId, 'EX', TTL_SECONDS);

  await smsProvider().sendOtp(phone, code);

  return { otpId, expiresInSeconds: TTL_SECONDS };
}

interface VerifyResult {
  verifiedToken: string;
  phone: string;
  purpose: OtpPurpose;
}

export async function verifyOtp(otpId: string, code: string): Promise<VerifyResult> {
  const raw = await redis.get(otpKey(otpId));
  if (!raw) throw new HttpError(410, 'OTP_EXPIRED', 'OTP has expired or does not exist');
  const stored = JSON.parse(raw) as StoredOtp;

  if (stored.attempts >= MAX_ATTEMPTS) {
    await redis.set(lockoutKey(stored.phone), '1', 'EX', LOCKOUT_SECONDS);
    await redis.del(otpKey(otpId));
    await redis.del(activeOtpByPhoneKey(stored.phone, stored.purpose));
    throw new HttpError(429, 'OTP_LOCKED', 'Too many attempts. Try again in 30 minutes.');
  }

  // Dev / demo bypass — when SMS_PROVIDER is `mock`, the buyer doesn't actually
  // receive the OTP (it just gets logged), so we accept any well-formed 6-digit
  // code. The otpId still has to be valid (so the rate-limit + attempts logic
  // still applies). Production providers never hit this branch because env
  // SMS_PROVIDER will be `msg91` or `twilio`.
  const isMockProvider = env.SMS_PROVIDER === 'mock';
  const ok = isMockProvider
    ? /^[0-9]{6}$/.test(code)
    : await bcrypt.compare(code, stored.codeHash);
  if (!ok) {
    stored.attempts += 1;
    await redis.set(otpKey(otpId), JSON.stringify(stored), 'KEEPTTL');
    throw new HttpError(401, 'OTP_INVALID', 'Incorrect OTP');
  }

  await redis.del(otpKey(otpId));
  await redis.del(activeOtpByPhoneKey(stored.phone, stored.purpose));

  // PRD §6.1.4 AC2 — once verified in a session, do not re-prompt for same phone.
  // Issue a short-lived signed token the client carries with subsequent lead submits.
  const phoneFingerprint = createHash('sha256').update(stored.phone).digest('hex').slice(0, 16);
  const verifiedToken = jwt.sign(
    { phone: stored.phone, purpose: stored.purpose, fpr: phoneFingerprint },
    env.OTP_VERIFIED_TOKEN_SECRET,
    { expiresIn: env.OTP_VERIFIED_TOKEN_TTL_SECONDS },
  );

  return { verifiedToken, phone: stored.phone, purpose: stored.purpose };
}

export interface VerifiedOtpClaims {
  phone: string;
  purpose: OtpPurpose;
  fpr: string;
}

export function consumeVerifiedToken(token: string, expectedPurpose: OtpPurpose): VerifiedOtpClaims {
  try {
    const claims = jwt.verify(token, env.OTP_VERIFIED_TOKEN_SECRET) as VerifiedOtpClaims;
    if (claims.purpose !== expectedPurpose) {
      throw new HttpError(401, 'OTP_PURPOSE_MISMATCH', 'OTP token issued for a different action');
    }
    return claims;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(401, 'OTP_TOKEN_INVALID', 'OTP verification token invalid or expired');
  }
}
