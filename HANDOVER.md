# Handover Runbook

This file captures everything the receiving team needs to take the codebase live. The PRD is the contract; this runbook is the bridge from code-handover (per SoW) to deployment.

## 1. Open questions still pending client decision

Per PRD §11 / `../DEVELOPMENT_PLAN.md` §9. Items 8 (Torque API), 9 (1903 font), 10 (OTP provider), 11 (email), 12 (hosting), 13 (domains), 14 (SSL), 15 (DPDP scope) all need client sign-off before production. Mock implementations are in place so dev can continue without them.

## 2. Swapping mocks for live providers

Every external dependency is behind a small interface — flip an env var, add a class, ship.

### 2.1 Torque DMS (Sprint 0 OQ#8)

| Where        | What to do |
|--------------|------------|
| `packages/torque-client/src/types.ts` | Already canonical. Don't change unless the PRD changes. |
| `packages/torque-client/src/factory.ts` | Add a `LiveTorqueClient` class that implements `TorqueClient` and wraps the real Torque endpoints with retry (exp backoff, 3 attempts), opossum circuit breaker, correlation-ID logging, sandbox/prod env switch (PRD §7.2). Branch on `opts.mode === 'live'`. |
| `apps/api/.env` | Set `TORQUE_MODE=live`, `TORQUE_BASE_URL=...`, `TORQUE_API_KEY=...`. |

Until the live impl lands, `TORQUE_MODE=mock` returns deterministic vehicles for any VIN starting with `1HD`.

### 2.2 SMS / OTP provider (Sprint 0 OQ#10)

| Where        | What to do |
|--------------|------------|
| `apps/api/src/modules/sms/sms.module.ts` | Add `Msg91SmsProvider implements SmsProvider`. Switch on `env.SMS_PROVIDER === 'msg91'`. |
| `apps/api/.env` | Set `SMS_PROVIDER=msg91`, `MSG91_AUTH_KEY=...`, `MSG91_TEMPLATE_ID=...`, `MSG91_SENDER_ID=...`. |

OTP rate limits, lockout, and resend caps stay the same — they live in the service, not the provider.

### 2.3 Email provider (Sprint 0 OQ#11)

| Where        | What to do |
|--------------|------------|
| `apps/api/src/modules/email/email.module.ts` | Add `SendgridEmailProvider implements EmailProvider`. Switch on `env.EMAIL_PROVIDER === 'sendgrid'`. |
| `apps/api/.env` | Set `EMAIL_PROVIDER=sendgrid`, `SENDGRID_API_KEY=...`, `EMAIL_FROM=...`. |

The `dealerLeadEmail()` helper builds an H-D-branded HTML template; tweak inline or move to MJML/Handlebars when volume warrants.

### 2.4 Object storage (S3 vs MinIO)

`apps/api/.env` — point `S3_ENDPOINT` / `S3_BUCKET` / credentials at AWS S3 in production. The current Add-Listing wizard accepts external URLs; image-upload + 1600×1200 / 400×300 resizing wires up next (PRD §6.2.3 AC3). Sharp + `multer` already installed.

### 2.5 Google Maps

`apps/api/.env` — set `GOOGLE_MAPS_API_KEY`. Replace the iframe embed in `apps/web-buyer/src/components/DealerLocator.tsx` with the JS Maps API + markers per the PRD §6.1.1 spec.

### 2.6 1903 font (Sprint 0 OQ#9)

Currently fallback Bebas Neue + Inter. When the licensed `1903` files arrive:
1. Drop the woff2/woff into `apps/web-buyer/public/fonts/` (and the same for dealer + admin).
2. Add `@font-face` declarations in `packages/ui/src/styles.css`.
3. The Tailwind preset (`packages/config/tailwind.preset.js`) already lists `"HD-1903 Bold Condensed"` first in the cascade — no other code change needed.

## 3. Production deployment checklist

Per SoW exclusions, deployment is the client's responsibility. Recommended steps:

1. **Provision** Postgres 16 (managed: AWS RDS / DO Managed Postgres), Redis 7, S3 bucket, SMTP/SendGrid, MSG91 account.
2. **Secrets** — generate fresh `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (`openssl rand -hex 64`), `OTP_VERIFIED_TOKEN_SECRET`, `PII_ENCRYPTION_KEY` (32-byte hex). Store in your secret manager (AWS SSM, Doppler, etc.) — **never commit**.
3. **Migrate** — `pnpm prisma:deploy` (uses `migrate deploy`, no destructive changes).
4. **Build** — `pnpm build` in CI; outputs land in `apps/*/dist`.
5. **Run** the API behind a reverse proxy (nginx / Caddy / ALB) with HTTPS + HSTS. The API already trusts proxy headers (`app.set('trust proxy', 1)`).
6. **Serve** the three SPAs as static files. Each `apps/web-*/dist` after `pnpm build`. Reverse-proxy `/api` and `/sitemap.xml` + `/robots.txt` to the API.
7. **DNS** — buyer site at apex (`hd-certified.in` say), dealer at `dealer.`, admin at `admin.` — all SSL via Let's Encrypt.
8. **Backups** — enable daily Postgres backup + 30-day retention (PRD §9.6). Enable S3 versioning on the assets bucket.
9. **Monitoring** — wire Sentry DSN into all four apps via env, plus a Postgres + Redis liveness check on `/api/v1/health/ready`.
10. **DPDP compliance** — cookie banner + privacy policy must be live before production (Sprint 0 OQ#15).

## 4. Environment variable reference

See `apps/api/.env.example`. Frontend apps don't need env vars at v1 — they call the API via the dev proxy or production reverse proxy.

| Var | Required? | Used for |
|-----|-----------|----------|
| `NODE_ENV` | yes | `production` flips logging/error verbosity |
| `PORT` | no (4000) | API listen port |
| `LOG_LEVEL` | no (`info`) | pino level |
| `CORS_ORIGINS` | yes in prod | Comma-separated list of FE origins |
| `DATABASE_URL` | yes | Postgres URI |
| `REDIS_URL` | yes | Redis URI |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | yes | 32+ byte secret each |
| `JWT_ACCESS_TTL_SECONDS` | no (900) | Access token TTL |
| `JWT_REFRESH_TTL_SECONDS` | no (604800) | Refresh token TTL |
| `OTP_VERIFIED_TOKEN_SECRET` | yes | Signs the post-OTP verifiedToken |
| `OTP_VERIFIED_TOKEN_TTL_SECONDS` | no (900) | verifiedToken TTL |
| `PII_ENCRYPTION_KEY` | yes | AES-256-GCM key (32+ chars) |
| `S3_ENDPOINT` / `S3_BUCKET` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | yes for uploads | Object storage |
| `SMS_PROVIDER` | yes | `mock` / `msg91` / `twilio` |
| `MSG91_AUTH_KEY` etc | yes if MSG91 | Provider creds |
| `EMAIL_PROVIDER` | yes | `mock` / `sendgrid` / `ses` |
| `SENDGRID_API_KEY` | yes if SendGrid | Provider creds |
| `EMAIL_FROM` | yes | Sender address |
| `TORQUE_MODE` | yes | `mock` / `live` |
| `TORQUE_BASE_URL` / `TORQUE_API_KEY` | yes if live | Torque DMS creds |
| `GOOGLE_MAPS_API_KEY` | yes for Maps | Server-side geocoding + JS embed |

## 5. Demo / smoke-test path

After `pnpm dev`, with seeded DB:

1. Visit http://localhost:5173 — hero loads, six benefit tiles render, dealer locator shows the seeded dealer.
2. Click **Search Stock** → filter sidebar + at least one card (the seeded Street Glide).
3. Click the card → detail page with gallery placeholder, EMI calculator, sticky enquiry rail, JSON-LD in `<head>`.
4. Click **Email Dealer** → modal collects name/phone/email/city/pincode → 6-digit OTP appears in the API logs (mock SMS) → enter it → enquiry submits → "Enquiry sent" success.
5. Visit http://localhost:5173/sell-bike → fill, submit, OTP → success.
6. Visit http://localhost:5174 → log in as `gurgaon-hd` / `Dealer@123!` → dashboard tiles populate → /leads shows the enquiry you just submitted with masked phone/email.
7. Click **+ Add Listing** → enter VIN `1HD1KHM18MB000123` → Torque mock returns a vehicle → walk through inspection / details / review → save draft → publish.
8. Visit http://localhost:5175 → log in as `admin@hd-cpo.local` / `Admin@123!` → dashboard date-range tiles → Dealers page shows the dealer + Bulk Import modal works → Listings tab shows ongoing → Content editor → Audit log shows your actions.
9. Visit http://localhost:4000/api/docs — Swagger UI lists every endpoint.
10. Visit http://localhost:4000/sitemap.xml — XML lists static paths + every active listing.

## 6. Things deliberately deferred to Change Requests

Per PRD scope:
- Native mobile app (web-responsive only is in scope).
- Multilingual support.
- Live finance/EMI processing beyond the calculator.
- Inspection-report generation (uploads only).
- Any DMS other than Torque.
- Post-sale flow (customer agreement, RC transfer) — PRD §11 OQ#7.
- Production deployment.
