# H-D CPO Marketplace

Harley-Davidson Certified Pre-Owned motorcycle marketplace — three web panels (Buyer / Dealer / Admin) on a single Node API, integrating with the Torque DMS.

> **Source of truth:** `../PRD_HarleyDavidson_CPO_Marketplace.docx` (see `docs/PRD.md` once mirrored in).
> **Brand:** Harley-Davidson 2026 Brand Guidelines.
> **Reference portal:** https://h-dcertified.co.nz (UI mirrored at ~80–85% fidelity).

## Stack

- **Frontend:** React 18 + TypeScript + Vite + Tailwind + shadcn-style primitives
- **Routing:** React Router v6
- **State:** TanStack Query (server) + Zustand (UI)
- **Forms:** React Hook Form + Zod (schemas shared with API via `@hd-cpo/types`)
- **Backend:** Node.js 20 + Express + TypeScript
- **ORM / DB:** Prisma + PostgreSQL 16
- **Cache / queue:** Redis 7 + (BullMQ in Sprint 3)
- **Object storage:** S3-compatible (MinIO locally)
- **Auth:** JWT (access 15m / refresh 7d) + bcrypt; OTP via SMS for buyer flows (MSG91 default)
- **Tooling:** pnpm + Turborepo monorepo, Vitest, Playwright (E2E), Pino logs, Sentry (FE+BE)

## Layout

```
apps/
  web-buyer/     Vite + React — public marketplace (port 5173)
  web-dealer/    Vite + React — dealer portal       (port 5174)
  web-admin/     Vite + React — admin portal        (port 5175)
  api/           Express + TS                       (port 4000)
packages/
  ui/            Brand-aligned React primitives + Tailwind preset consumers
  types/         Shared TypeScript types + Zod schemas
  config/        tsconfig bases, ESLint flat config, Tailwind preset (HD tokens)
  torque-client/ Typed Torque DMS wrapper + in-memory Mock for Sprint 0/1
apps/api/prisma/
  schema.prisma  All entities from PRD §5.2 (lives under apps/api so prisma's basedir
                 resolution finds @prisma/client under pnpm's isolated layout)
  seed.ts        Seeds an admin + a sample dealer + one sample listing
docker-compose.yml  Postgres 16 + Redis 7 + MinIO
```

## Prerequisites

**Just Node.js 20+ and pnpm 10+.** No Docker required.

- pnpm via Corepack: `corepack enable pnpm && corepack prepare pnpm@latest --activate`

The API auto-boots an **embedded Postgres 18** (binary ships via npm, lives at
`apps/api/.devdb/`) and uses an **in-process Redis mock** by default. Both are configured for
local dev — no install, no service, no Docker.

> Want to use a real Postgres / Redis instead? Set `EMBEDDED_DB=0` and point `DATABASE_URL` /
> `REDIS_URL` at your own services.

## First-time setup

```bash
# 1. Install workspace dependencies
pnpm install

# 2. Copy the API env file (defaults work as-is for local dev)
cp apps/api/.env.example apps/api/.env

# That's it. The API's `pnpm dev` script handles initdb, schema sync, and seeding.
```

### Demo credentials (auto-seeded on first boot)

| Role   | Login                              | Password     |
|--------|------------------------------------|--------------|
| Admin  | `admin@hd-cpo.local`               | `Admin@123!` |
| Dealer | `gurgaon-hd`                       | `Dealer@123!`|

## Running locally

```bash
# Everything (API + 3 frontends) in parallel via Turborepo
pnpm dev
```

The API workspace's `dev` script orchestrates:
1. Boots embedded Postgres on port **55432** (port 5432 is often blocked by Hyper-V's
   reserved port range on Windows).
2. Runs `prisma db push` (or `prisma migrate deploy` if migrations exist) to sync the schema.
3. Seeds an admin + dealer + sample listing if the DB is empty.
4. Starts the API on port 4000 with `tsx watch`.

Then open:

- Buyer site:      http://localhost:5173
- Dealer portal:   http://localhost:5174
- Admin portal:    http://localhost:5175
- API health:      http://localhost:4000/api/v1/health/ready
- OpenAPI docs:    http://localhost:4000/api/docs

To run a single workspace:

```bash
pnpm --filter @hd-cpo/api dev          # API only (still boots embedded Postgres)
pnpm --filter @hd-cpo/web-buyer dev    # Buyer frontend only
```

## Useful commands

| Command                | Purpose                                                 |
|------------------------|---------------------------------------------------------|
| `pnpm dev`             | Run all apps in parallel                                |
| `pnpm build`           | Build everything                                        |
| `pnpm typecheck`       | Workspace-wide TypeScript check                         |
| `pnpm test`            | Workspace-wide unit tests                               |
| `pnpm prisma:studio`   | Open Prisma Studio (DB GUI) against embedded Postgres   |
| `pnpm prisma:migrate`  | Create + apply a new migration                          |
| Reset embedded DB      | `rm -rf apps/api/.devdb` then `pnpm --filter @hd-cpo/api dev` |

## Sprint roadmap & status

| Sprint | Weeks  | Focus | Status |
|--------|--------|-------|--------|
| 0      | Wk 0   | Inception, resolve open questions, lock Torque API spec, brand assets | partial (open questions in plan) |
| 1      | Wk 1–2 | **Foundations** — shared config, schema, auth, dev env | ✅ done |
| 2      | Wk 3–4 | **Listings core** — Torque flow, Add Listing wizard, buyer search + detail | ✅ done |
| 3      | Wk 5–6 | **Leads & OTP** — info-gate popup, all 3 lead types, dealer notifications | ✅ done |
| 4      | Wk 7–8 | **Admin** — dashboard, dealer mgmt + bulk import, content CMS, audit log | ✅ done |
| 5      | Wk 9–10| **Polish** — sitemap/robots/SEO, dealer locator, accessibility, info pages, stale flag | ✅ done |
| 6      | Wk 11–12| **UAT + handover** — tests, runbook, README | ✅ done (pending real UAT) |

See `../DEVELOPMENT_PLAN.md` for the full plan and `HANDOVER.md` for the runbook.

## What's actually shipped (API surface)

```
GET    /api/v1/health                              Liveness
GET    /api/v1/health/ready                        Readiness (DB + Redis)
GET    /api/v1/openapi.json                        OpenAPI spec
GET    /api/docs                                   Swagger UI

POST   /api/v1/auth/dealer/login                   Dealer JWT login
POST   /api/v1/auth/admin/login                    Admin JWT login
POST   /api/v1/auth/refresh                        Refresh access token

POST   /api/v1/otp/send                            Send OTP (rate-limited)
POST   /api/v1/otp/verify                          Verify OTP → verifiedToken

GET    /api/v1/listings                            Public search (URL filters)
GET    /api/v1/listings/:slug                      Public listing detail
GET    /api/v1/listings/_config/model-families     Distinct families

POST   /api/v1/leads/general                       Info-gate lead   (Bearer verifiedToken)
POST   /api/v1/leads/trade-in                      Sell-bike lead   (Bearer verifiedToken)
POST   /api/v1/leads/listings/:slug/enquiry        Listing enquiry  (Bearer verifiedToken)

GET    /api/v1/dealers                             Public dealer locator
GET    /api/v1/static/:key                         Public static content

GET    /api/v1/dealer/listings                     Dealer auth: own inventory
POST   /api/v1/dealer/listings                     Dealer auth: create draft
PATCH  /api/v1/dealer/listings/:id                 Dealer auth: update price/desc/kms/images
POST   /api/v1/dealer/listings/:id/publish         Dealer auth: publish DRAFT → ACTIVE
POST   /api/v1/dealer/listings/:id/mark-sold       Dealer auth: ACTIVE → SOLD (sync Torque)
DELETE /api/v1/dealer/listings/:id                 Dealer auth: soft remove
GET    /api/v1/dealer/leads/general                Dealer auth: general queue
GET    /api/v1/dealer/leads/buyer                  Dealer auth: listing-enquiry queue
GET    /api/v1/dealer/leads/trade-in               Dealer auth: trade-in queue
PATCH  /api/v1/dealer/leads/:kind/:id/status       Dealer auth: change lead status

GET    /api/v1/torque/vehicles/:vin                Dealer auth: VIN lookup (mock or live)
GET    /api/v1/torque/vehicles/:vin/cpo-kit        Dealer auth: CPO kit URLs

GET    /api/v1/admin/metrics?range=today|7d|30d    Admin: dashboard tiles
GET    /api/v1/admin/dealers?status&q              Admin: dealer list
POST   /api/v1/admin/dealers                       Admin: create dealer
PATCH  /api/v1/admin/dealers/:id                   Admin: edit dealer
PATCH  /api/v1/admin/dealers/:id/status            Admin: activate / suspend
POST   /api/v1/admin/dealers/:id/reset-password    Admin: generate new password
POST   /api/v1/admin/import/dealers                Admin: .xlsx bulk import
GET    /api/v1/admin/listings?status&q             Admin: moderation list
POST   /api/v1/admin/listings/:id/remove           Admin: hard-remove with reason
POST   /api/v1/admin/listings/:id/deactivate       Admin: temporary deactivate
GET    /api/v1/admin/content                       Admin: list content keys
GET    /api/v1/admin/content/:key                  Admin: get content body
PUT    /api/v1/admin/content/:key                  Admin: upsert content (versioned)
GET    /api/v1/admin/audit?action&entityType&format=csv  Admin: audit log + CSV export

GET    /sitemap.xml                                Dynamic sitemap (proxied to buyer site)
GET    /robots.txt                                 Robots policy
```

## What's actually shipped (frontend pages)

**Buyer (`web-buyer`, port 5173)**
- `/` Hero + search widget + 6 benefit tiles + dealer locator (mirrors NZ portal)
- `/search` URL-driven filter sidebar + paginated card grid + skeletons
- `/listings/:slug` Gallery + sticky enquiry rail + EMI calculator + JSON-LD Vehicle schema
- `/sell-bike` Trade-in form, OTP-gated
- `/finance`, `/insurance` Static info pages
- `/about`, `/privacy`, `/terms`, `/faq`, `/contact` Pulled from CMS, sanitised with DOMPurify
- Skip-to-content link, keyboard nav, brand-correct H-D orange / black tokens

**Dealer (`web-dealer`, port 5174)** — auth-gated SPA
- `/login` Username + password
- `/dashboard` Active-listings + 7-day lead tiles + 60-day stale flag
- `/listings` Table with status filter + Publish/Mark-Sold/Remove actions
- `/listings/new` 4-step wizard (VIN → inspection → details → review)
- `/leads` Tabbed queue (General / Listing / Trade-in) + inline status updates

**Admin (`web-admin`, port 5175)** — auth-gated SPA
- `/login` Email + password
- `/dashboard` Date-range tiles, lead mix, dealer status breakdown, top-5 leaderboards
- `/dealers` CRUD + suspend/activate + password reset + .xlsx bulk import modal
- `/listings` Tabbed moderation (Ongoing / Sold / Removed / Drafts / Deactivated / All)
- `/content` Per-key HTML editor with version tracking
- `/audit` Filterable audit log + CSV export

## Tests

```bash
pnpm -r test
```

24 tests across:
- `packages/types` — VIN, listing search query coercion, cert status, create-listing payload (11 tests)
- `packages/torque-client` — mock client behaviour (4 tests)
- `apps/api/utils/slug` — listing-slug generation (4 tests)
- `apps/api/utils/crypto` — PII round-trip + tamper detection + masking (5 tests)

## Brand-token mapping

Verified against the **Harley-Davidson 2026 Brand Guidelines** (Feb 2026 edition,
pages 67 + 70-71). The Tailwind preset at `packages/config/tailwind.preset.js`
implements:

**Colours (page 67):**

| Token | Brand name | PMS | Hex |
|---|---|---|---|
| `hd-orange` | harley-davidson orange | 165C | `#FF6600` |
| `hd-black` | harley-davidson black | Black 6c | `#000000` |
| `hd-white` | bright white | — | `#FFFFFF` |

Orange is used **only for emphasis** (CTAs, badges) — never large fields, per
the guideline "used in small amounts, for emphasis". Black dominates; white is
used in moderation.

The separate **Factory Racing palette** (PMS 179c orange `#E34D1E`, PMS 293c
blue `#0F3682`, PMS 185c red `#C31919`) is reserved for racing campaigns and
championship celebrations and is intentionally NOT used in this marketplace.

**Typography (pages 70-71):**

The brand uses **1903** — a custom typeface designed in 2022, in three styles
(Sans Condensed, Sans, Serif), each with Italic / Bold / Bold Italic.

| Tailwind class | Family used | Where |
|---|---|---|
| `font-headline` + `tracking-headline` (0) + `leading-headline` (0.95) | 1903 Sans Condensed Bold, ALL CAPS | h1-h6, hero headline |
| `font-subhead` + `tracking-subhead` (0.05em) | 1903 Sans Bold, ALL CAPS | section eyebrows, button labels, badges |
| `font-body` (default) | 1903 Sans Regular | paragraph copy, form labels |
| `font-serif` | 1903 Serif | reserved for text-heavy applications |

Brand rules enforced in CSS:
- Headlines use **tight leading** (0.95) and **no tracking** (0). The brand
  explicitly says "Do not track out the letter spacing" for headlines.
- Subheads use slightly opened tracking (0.05em) per "may be opened up slightly".
- Body uses normal letter spacing and leading.

The 1903 font files are proprietary and not yet supplied (PRD Open Question 9).
Fallback chain: **Bebas Neue → Oswald → Impact** for headline/subhead, **Inter →
system-ui** for body. When the licensed `.woff2` files arrive, drop them in
`apps/web-*/public/fonts/` and the existing `@font-face` declarations in
`packages/ui/src/styles.css` (with `local()` lookups for the `1903 Sans
Condensed`, `1903 Sans`, `1903 Serif` family names) will resolve them
automatically — no other code change required.

**Brand naming:** all source consistently uses `Harley-Davidson` (with hyphen)
and `H-D` (with hyphen) per the brand book's naming rules. Verified by grep —
no stray `Harley Davidson` or bare `HD` appears in the codebase.

## Embedded Postgres + Redis mock

Local dev uses two zero-install backends so you don't need Docker:

- **Postgres**: `embedded-postgres` ships a portable Postgres 18 binary via npm. The
  orchestrator at `apps/api/scripts/dev-server.mjs` initialises the cluster on first run
  (creates `apps/api/.devdb/`, sets up the `hd_cpo_marketplace` database), starts it on
  port 55432, and shuts it down cleanly when you Ctrl-C the API.
- **Redis**: `ioredis-mock` provides an in-process Redis-compatible store. Triggered by
  `REDIS_URL=mock://`. Loses state between restarts — fine for OTP/dev, not for production.

For production or shared dev environments, point `DATABASE_URL` and `REDIS_URL` at real
services and set `EMBEDDED_DB=0` to skip the embedded Postgres boot.

## Note on Prisma scripts

The `prisma:*` scripts pass `PRISMA_GENERATE_SKIP_AUTOINSTALL=1` (via `cross-env`) so Prisma's
CLI doesn't try to auto-(re)install itself or `@prisma/client` mid-generate. Both are already
declared as deps in `apps/api/package.json` and are guaranteed to be present after `pnpm install`.
Skipping the auto-installer also avoids a known issue where Prisma's bundled `@antfu/ni`
calls a misconfigured `pnpm.cmd` shim on some Windows + WinGet Node setups.

The Prisma schema lives at `apps/api/prisma/schema.prisma` (not the repo root) so the CLI's
basedir-rooted module resolution finds the local `@prisma/client` install correctly under pnpm's
isolated `node_modules` layout.

## Open questions blocking Sprint 0

15 items in [DEVELOPMENT_PLAN §9](../DEVELOPMENT_PLAN.md). The most time-critical:

- **#8 Torque API contract** — required before Sprint 2. Mock client is in place to unblock dev.
- **#9 1903 font licence** — fallback (Bebas Neue + Inter) wired into the Tailwind preset until provided.
- **#10 OTP/SMS provider** — MSG91 default, abstracted behind an interface.
