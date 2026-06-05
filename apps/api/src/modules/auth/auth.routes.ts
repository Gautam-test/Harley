import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { dealerLoginInput, adminLoginInput } from '@hd-cpo/types';
import { validate } from '../../middleware/validate.js';
import { getEnv } from '../../config/env.js';
import { requireAuth } from '../../middleware/auth.js';
import { prisma } from '../../config/prisma.js';
import { HttpError } from '../../middleware/error-handler.js';
import { adminLogin, dealerLogin, refreshAccessToken } from './auth.service.js';

// QA decision: per-IP login rate limit removed. Dealers and admins were
// tripping the 10/15min cap during routine QA + multi-tab workflows
// (shared office IPs put all 15 dealers behind one origin). The other
// safeguards stay in place — bcrypt password compare is the real brake
// on credential-stuffing speed, refresh-token reuse detection revokes
// sibling sessions, and the generic INVALID_CREDENTIALS error keeps the
// enumeration surface flat. If brute-force telemetry shows abuse later,
// re-attach the limiter below to the login routes.
const isProd = getEnv().NODE_ENV === 'production';

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

authRouter.post('/admin/login', validate(adminLoginInput), async (req, res, next) => {
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

// Self-profile lookup. Returns the full record for the authenticated user
// (dealer or admin) so the in-app profile page can render every detail
// without needing a role-specific endpoint per surface.
authRouter.get('/me', requireAuth(['DEALER', 'ADMIN']), async (req, res, next) => {
  try {
    const auth = req.auth!;
    if (auth.role === 'DEALER') {
      const dealer = (await prisma.dealer.findUnique({
        where: { id: auth.sub },
        select: {
          id: true,
          username: true,
          name: true,
          legalName: true,
          email: true,
          phone: true,
          address: true,
          city: true,
          state: true,
          pincode: true,
          status: true,
          torqueDealerId: true,
          createdAt: true,
        },
      })) as Record<string, unknown> | null;
      if (!dealer) throw new HttpError(404, 'NOT_FOUND', 'Profile not found');
      res.json({ role: 'DEALER', ...dealer });
      return;
    }
    const admin = (await prisma.adminUser.findUnique({
      where: { id: auth.sub },
      select: { id: true, email: true, name: true, createdAt: true },
    })) as Record<string, unknown> | null;
    if (!admin) throw new HttpError(404, 'NOT_FOUND', 'Profile not found');
    res.json({ role: 'ADMIN', ...admin });
  } catch (e) {
    next(e);
  }
});
