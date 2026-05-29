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
  // Access token TTL — keep short (15 min) so revocation propagates fast;
  // the SPA silently refreshes via the rotating refresh token below.
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  // Refresh token (= effective dealer / admin session length): 12 hours
  // per QA. Once expired, the SPA's silent-refresh path returns null and
  // the api.ts client clears auth + bounces to /login with a "Session
  // expired" toast. Override via env in long-lived demo / staging if a
  // longer window is needed (production stays at the 12h default).
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(12 * 60 * 60),

  OTP_VERIFIED_TOKEN_SECRET: z.string().min(16),
  OTP_VERIFIED_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),

  PII_ENCRYPTION_KEY: z.string().min(32),

  S3_ENDPOINT: optionalUrl,
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY_ID: optionalString,
  S3_SECRET_ACCESS_KEY: optionalString,
  S3_BUCKET: z.string().default('hd-cpo-assets'),

  SMS_PROVIDER: z.enum(['mock', 'msg91', 'twilio']).default('mock'),
  EMAIL_PROVIDER: z.enum(['mock', 'sendgrid', 'ses', 'smtp']).default('mock'),
  // SMTP transport — used only when EMAIL_PROVIDER=smtp. Live credentials
  // live ONLY in the gitignored apps/api/.env; .env.example carries
  // placeholders. For Gmail use an App Password (not the account
  // password) in SMTP_PASS, host smtp.gmail.com, port 587 (STARTTLS,
  // SMTP_SECURE=false) or 465 (SSL, SMTP_SECURE=true).
  SMTP_HOST: z.string().default('smtp.gmail.com'),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z.coerce.boolean().default(false),
  SMTP_USER: optionalString,
  SMTP_PASS: optionalString,
  // From-address (display name + address) on outbound mail, and the admin
  // inbox that receives new-dealer-request + new-listing-queue alerts.
  EMAIL_FROM: z.string().default('H-D Certified <no-reply@hd-certified.in>'),
  EMAIL_ADMIN: optionalString,
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

  // Soft-warn when a production NODE_ENV is paired with mock providers.
  // We deliberately do NOT exit(1) here — the demo / staging environment
  // still depends on `mock` SMS so any 6-digit code passes verification.
  // The boot log makes the misconfiguration visible to anyone watching.
  // To upgrade this to a hard guard, swap the console.error block for
  // process.exit(1) — see HANDOVER.md "Production deployment checklist".
  if (cached.NODE_ENV === 'production') {
    const mockedProviders: string[] = [];
    if (cached.SMS_PROVIDER === 'mock') mockedProviders.push('SMS_PROVIDER');
    if (cached.EMAIL_PROVIDER === 'mock') mockedProviders.push('EMAIL_PROVIDER');
    if (cached.TORQUE_MODE === 'mock') mockedProviders.push('TORQUE_MODE');
    if (mockedProviders.length > 0) {
      // eslint-disable-next-line no-console
      console.error(
        `\n⚠️  PRODUCTION + MOCK PROVIDERS — ${mockedProviders.join(', ')} are still set to "mock". ` +
          'OTPs accept any 6-digit code and dealer notifications never leave the host. ' +
          'Switch to msg91/sendgrid/live before serving real users.\n',
      );
    }
  }

  return cached;
}

export function corsOrigins(): string[] {
  return getEnv()
    .CORS_ORIGINS.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
