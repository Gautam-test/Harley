import { PrismaClient } from '@prisma/client';
import { getEnv } from './env.js';

const env = getEnv();

export const prisma = new PrismaClient({
  log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});
