import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getEnv } from '../../config/env.js';
import { prisma } from '../../config/prisma.js';
import { HttpError } from '../../middleware/error-handler.js';
import type { AuthClaims } from '../../middleware/auth.js';

const env = getEnv();

function signTokens(claims: AuthClaims) {
  const accessToken = jwt.sign(claims, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL_SECONDS,
  });
  const refreshToken = jwt.sign(claims, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_TTL_SECONDS,
  });
  return { accessToken, refreshToken };
}

export async function dealerLogin(username: string, password: string) {
  const dealer = await prisma.dealer.findUnique({ where: { username } });
  if (!dealer || dealer.status !== 'ACTIVE') {
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid username or password');
  }
  const ok = await bcrypt.compare(password, dealer.passwordHash);
  if (!ok) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid username or password');

  const claims: AuthClaims = { sub: dealer.id, role: 'DEALER', name: dealer.name };
  return { ...signTokens(claims), user: { id: dealer.id, role: 'DEALER' as const, name: dealer.name } };
}

export async function adminLogin(email: string, password: string) {
  const admin = await prisma.adminUser.findUnique({ where: { email } });
  if (!admin) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  const ok = await bcrypt.compare(password, admin.passwordHash);
  if (!ok) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');

  const claims: AuthClaims = { sub: admin.id, role: 'ADMIN', name: admin.name };
  return { ...signTokens(claims), user: { id: admin.id, role: 'ADMIN' as const, name: admin.name } };
}

export function refreshAccessToken(refreshToken: string) {
  try {
    const claims = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as AuthClaims;
    const { accessToken } = signTokens({ sub: claims.sub, role: claims.role, name: claims.name });
    return { accessToken };
  } catch {
    throw new HttpError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token invalid or expired');
  }
}
