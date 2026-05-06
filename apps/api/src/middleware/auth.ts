import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { getEnv } from '../config/env.js';
import { HttpError } from './error-handler.js';

type Role = 'DEALER' | 'ADMIN';

export interface AuthClaims {
  sub: string;
  role: Role;
  name: string;
}

// Augment Express's Request with our auth claims. Imported in main.ts so
// the augmentation lands once at startup.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthClaims;
    }
  }
}

export function requireAuth(roles: Role[] = []): RequestHandler {
  const env = getEnv();
  return (req, _res, next) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return next(new HttpError(401, 'UNAUTHENTICATED', 'Missing bearer token'));
    }
    const token = header.slice(7);
    try {
      const claims = jwt.verify(token, env.JWT_ACCESS_SECRET) as AuthClaims;
      if (roles.length > 0 && !roles.includes(claims.role)) {
        return next(new HttpError(403, 'FORBIDDEN', 'Insufficient role'));
      }
      req.auth = claims;
      next();
    } catch {
      next(new HttpError(401, 'INVALID_TOKEN', 'Invalid or expired token'));
    }
  };
}

// "Try to authenticate but don't require it" — useful for routes that serve
// public content for ACTIVE listings (no token needed) but should still let
// the dealer/admin through for non-public states (DRAFT, SOLD, REMOVED).
// Populates req.auth when the bearer is valid; otherwise leaves it undefined
// and lets the route apply its own status-based gate.
export const optionalAuth: RequestHandler = (req, _res, next) => {
  const env = getEnv();
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next();
  try {
    req.auth = jwt.verify(header.slice(7), env.JWT_ACCESS_SECRET) as AuthClaims;
  } catch {
    // Silently ignore — route handler decides whether public access is OK.
  }
  next();
};
