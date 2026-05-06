import { Redis } from 'ioredis';
import RedisMock from 'ioredis-mock';
import { getEnv } from './env.js';
import { logger } from './logger.js';

const env = getEnv();

// REDIS_URL=mock:// → in-process mock (zero external dependency for local dev).
// Anything else → real Redis over the wire.
function buildRedis(): Redis {
  if (env.REDIS_URL.startsWith('mock://')) {
    logger.info('Redis: using in-process mock (REDIS_URL=mock://)');
    return new RedisMock() as unknown as Redis;
  }
  const r = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
  });
  r.on('error', (err) => logger.error({ err }, 'Redis error'));
  r.on('connect', () => logger.info('Redis connected'));
  return r;
}

export const redis = buildRedis();
