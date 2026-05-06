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

authRouter.post('/refresh', validate(refreshInput), (req, res, next) => {
  try {
    const { refreshToken } = req.body as { refreshToken: string };
    res.json(refreshAccessToken(refreshToken));
  } catch (e) {
    next(e);
  }
});
