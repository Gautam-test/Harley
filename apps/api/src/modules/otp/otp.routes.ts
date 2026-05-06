import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { otpSendInput, otpVerifyInput } from '@hd-cpo/types';
import { validate } from '../../middleware/validate.js';
import { sendOtp, verifyOtp } from './otp.service.js';

export const otpRouter = Router();

const otpSendLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many OTP requests' } },
});

const otpVerifyLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many verify attempts' } },
});

otpRouter.post('/send', otpSendLimiter, validate(otpSendInput), async (req, res, next) => {
  try {
    const { phone, purpose } = req.body as { phone: string; purpose: 'ENQUIRY' | 'GENERAL_LEAD' | 'TRADE_IN' };
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
