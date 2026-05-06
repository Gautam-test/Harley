import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { dealerLoginInput, adminLoginInput } from '@hd-cpo/types';
import { validate } from '../../middleware/validate.js';
import { getEnv } from '../../config/env.js';
import { adminLogin, dealerLogin, refreshAccessToken } from './auth.service.js';

// Login attempt limit per IP. Production uses a tight cap (brute-force defence);
// dev / CI raises it so e2e suites + repeated dev logins don't trip the gate.
const isProd = getEnv().NODE_ENV === 'production';
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 10 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts, try again later' } },
});

// Refresh has its own (looser) limiter — a real client only refreshes once
// every ~14 minutes (access TTL is 15 min) but we allow a generous burst so
// a tab that's been backgrounded / a sleeping laptop can flush several
// refreshes back-to-back without locking out. Tightens an attacker who
// scripts replay attempts against a leaked refresh token.
const refreshLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isProd ? 30 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many refresh attempts' } },
});

const refreshInput = z.object({ refreshToken: z.string().min(10) });

export const authRouter = Router();

authRouter.post(
  '/dealer/login',
  loginLimiter,
  validate(dealerLoginInput),
  async (req, res, next) => {
    try {
      const { username, password } = req.body as { username: string; password: string };
      res.json(await dealerLogin(username, password));
    } catch (e) {
      next(e);
    }
  },
);

authRouter.post('/admin/login', loginLimiter, validate(adminLoginInput), async (req, res, next) => {
  try {
    const { email, password } = req.body as { email: string; password: string };
    res.json(await adminLogin(email, password));
  } catch (e) {
    next(e);
  }
});

authRouter.post('/refresh', refreshLimiter, validate(refreshInput), async (req, res, next) => {
  try {
    const { refreshToken } = req.body as { refreshToken: string };
    res.json(await refreshAccessToken(refreshToken));
  } catch (e) {
    next(e);
  }
});
