import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { otpSendInput, otpVerifyInput } from '@hd-cpo/types';
import { validate } from '../../middleware/validate.js';
import { sendOtp, verifyOtp } from './otp.service.js';

export const otpRouter = Router();

// Dev / E2E bypass — the per-phone defences in otp.service.ts (30s
// window, 3/hour, 10/day, lockout) are the real abuse guard; the IP-
// level express-rate-limit was a thin flood-guard. In production both
// layers stack. In development a Playwright run that hits Send/Verify
// across half a dozen unique test numbers in 30s would trip the IP
// limiter and mask the actual feature under test. Skip the IP layer
// when NODE_ENV is not production OR when an explicit bypass flag is set.
const limiterSkip = (): boolean =>
  process.env.NODE_ENV !== 'production' ||
  process.env.E2E_BYPASS_OTP_LIMITER === '1';

const otpSendLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: limiterSkip,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many OTP requests' } },
});

const otpVerifyLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: limiterSkip,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many verify attempts' } },
});

otpRouter.post('/send', otpSendLimiter, validate(otpSendInput), async (req, res, next) => {
  try {
    const { phone, purpose } = req.body as { phone: string; purpose: 'ENQUIRY' | 'TRADE_IN' };
    res.json(await sendOtp(phone, purpose));
  } catch (e) {
    next(e);
  }
});

otpRouter.post('/verify', otpVerifyLimiter, validate(otpVerifyInput), async (req, res, next) => {
  try {
    const { otpId, code } = req.body as { otpId: string; code: string };
    const result = await verifyOtp(otpId, code);
    res.json({ verifiedToken: result.verifiedToken });
  } catch (e) {
    next(e);
  }
});
