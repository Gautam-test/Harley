import 'dotenv/config';
import { z } from 'zod';

// Treat empty strings in optional fields as "unset" — .env files commonly use `KEY=`
// to declare a placeholder, and Zod's `z.string().url()` would reject `""`.
const optionalUrl = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.string().url().optional(),
);
const optionalString = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.string().optional(),
);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),

  DATABASE_URL: z.string().min(1),
  // mock:// uses in-process ioredis-mock; anything else is treated as a real Redis URL.
  REDIS_URL: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(604800),

  OTP_VERIFIED_TOKEN_SECRET: z.string().min(16),
  OTP_VERIFIED_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),

  PII_ENCRYPTION_KEY: z.string().min(32),

  S3_ENDPOINT: optionalUrl,
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY_ID: optionalString,
  S3_SECRET_ACCESS_KEY: optionalString,
  S3_BUCKET: z.string().default('hd-cpo-assets'),

  SMS_PROVIDER: z.enum(['mock', 'msg91', 'twilio']).default('mock'),
  EMAIL_PROVIDER: z.enum(['mock', 'sendgrid', 'ses']).default('mock'),
  TORQUE_MODE: z.enum(['mock', 'live']).default('mock'),
  TORQUE_BASE_URL: optionalUrl,
  TORQUE_API_KEY: optionalString,

  // Sentry — DSN gated. When the DSN is empty (default), the API skips Sentry
  // init entirely with no penalty. To enable, install `@sentry/node` in the
  // API package and set SENTRY_DSN at deploy time. See `src/config/sentry.ts`.
  SENTRY_DSN: optionalString,
  SENTRY_ENVIRONMENT: optionalString, // 'staging' | 'production' | etc.
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),

  // PRD §6.3.4 default — dealer creates DRAFT, admin reviews + publishes.
  // Flip this to `1` to skip the admin gate and have dealer-side creates land
  // as ACTIVE immediately. Useful for demos and sales walkthroughs; do not
  // enable in production unless the trust model has changed.
  LISTINGS_AUTO_PUBLISH: z
    .enum(['0', '1'])
    .default('0')
    .transform((v) => v === '1'),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  cached = parsed.data;
  return cached;
}

export function corsOrigins(): string[] {
  return getEnv()
    .CORS_ORIGINS.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
