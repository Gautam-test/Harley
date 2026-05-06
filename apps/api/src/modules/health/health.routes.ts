import { Router } from 'express';
import { prisma } from '../../config/prisma.js';
import { redis } from '../../config/redis.js';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

healthRouter.get('/ready', async (_req, res) => {
  const checks: Record<string, 'ok' | 'down'> = {};
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.postgres = 'ok';
  } catch {
    checks.postgres = 'down';
  }
  try {
    const ping = await redis.ping();
    checks.redis = ping === 'PONG' ? 'ok' : 'down';
  } catch {
    checks.redis = 'down';
  }
  const allOk = Object.values(checks).every((v) => v === 'ok');
  res.status(allOk ? 200 : 503).json({ status: allOk ? 'ok' : 'degraded', checks });
});
