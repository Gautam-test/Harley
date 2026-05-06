# Going Live — Render (API) + Vercel (3 frontends)

End-to-end recipe to take the H-D CPO marketplace from this monorepo to a
public deployment. ~30 min if you have Render + Vercel accounts ready.

```
                ┌─────────────────────────┐
                │  buyer.vercel.app       │  ← public marketplace
                ├─────────────────────────┤
                │  dealer.vercel.app      │  ← auth-gated
                ├─────────────────────────┤
                │  admin.vercel.app       │  ← auth-gated
                └────────────┬────────────┘
                             │  HTTPS / CORS
                             ▼
                ┌─────────────────────────┐
                │   harley-api.onrender   │
                │   (Express + Prisma)    │
                └────────────┬────────────┘
                             │
            ┌────────────────┴────────────────┐
            ▼                                 ▼
    ┌──────────────┐                  ┌──────────────┐
    │  Postgres 16 │                  │   Redis 7    │
    │  (Render)    │                  │   (Render)   │
    └──────────────┘                  └──────────────┘
```

## Pre-flight

| You need | How to get it |
|---|---|
| **Render account** | Free signup at render.com — connect your GitLab/GitHub |
| **Vercel account** | Free signup at vercel.com — connect your GitLab/GitHub |
| **Repo access** | Both platforms read from `git.orangemantra.org/helpdesk/harley-node` (or harley-react). If using SSO/private auth, add deploy keys for both platforms |

The repo already contains:
- **`render.yaml`** at the root — Render Blueprint for API + Postgres + Redis
- **`apps/web-{buyer,dealer,admin}/vercel.json`** — per-frontend rewrites + headers
- API + frontends configured to read **`VITE_API_URL`** at build time

---

## Part 1 — Backend on Render (~10 min)

### 1.1 Create the Blueprint

1. **Render dashboard** → **New +** → **Blueprint**.
2. Connect the repo (GitLab → `helpdesk/harley-node`). Render reads `render.yaml` automatically.
3. **Apply** the Blueprint. Render provisions:
   - `harley-api` (web service, free tier — $0)
   - `harley-db` (managed Postgres 16, free tier — expires in 90 days)
   - `harley-redis` (managed Redis 7, free tier)
4. Wait ~3–5 minutes for the first build. The build runs:
   ```
   pnpm install --frozen-lockfile
   pnpm --filter @hd-cpo/api prisma:generate
   pnpm --filter @hd-cpo/api build
   ```
   The start command then:
   ```
   pnpm --filter @hd-cpo/api prisma:deploy   # apply migrations
   pnpm --filter @hd-cpo/api start            # node dist/main.js
   ```

### 1.2 Verify the API is up

Open the health endpoint:
```
https://harley-api.onrender.com/api/v1/health/ready
→ {"status":"ok","checks":{"postgres":"ok","redis":"ok"}}
```

If `postgres` is down, the migration may have failed — check the Render Logs tab.

### 1.3 Seed the database

Open Render → `harley-api` → **Shell** tab and run:
```
pnpm --filter @hd-cpo/api prisma:seed
pnpm --filter @hd-cpo/api prisma:seed-extra
```

This creates:
- 1 admin (`admin@hd-cpo.local` / `Admin@123!` — **rotate before going public**)
- 15 dealers across major Indian cities
- ~50 listings spread across the dealers
- 5 CMS pages (about, faq, privacy, terms, contact)
- 1 sample order for the Track Your Harley demo

### 1.4 Note the API URL

Render will show:
```
https://harley-api.onrender.com
```
You'll need this for Vercel.

---

## Part 2 — Frontends on Vercel (~15 min total, 5 min each)

You'll create **three Vercel projects** — one per frontend — all reading from the same git repo but with different `Root Directory` settings.

### 2.1 Create the Buyer project

1. **Vercel dashboard** → **Add New** → **Project**.
2. Import `git.orangemantra.org/helpdesk/harley-react` (or harley-node — same content).
3. **Root Directory**: `apps/web-buyer`.
4. **Framework Preset**: Vite.
5. **Build & Output**: leave defaults — Vercel picks them up from `vercel.json`.
6. **Environment Variables** — add one:
   ```
   VITE_API_URL = https://harley-api.onrender.com
   ```
7. **Deploy**. ~2 min for the first build.
8. Note the URL: `https://harley-buyer-xxxx.vercel.app` (or the project name you picked).

### 2.2 Create the Dealer project

Same as 2.1 but:
- **Root Directory**: `apps/web-dealer`
- Project name: `harley-dealer` (URL becomes `harley-dealer.vercel.app`)

### 2.3 Create the Admin project

- **Root Directory**: `apps/web-admin`
- Project name: `harley-admin`

### 2.4 Update Render's CORS to allow your Vercel URLs

After all three frontends are live, copy their URLs and update the API's `CORS_ORIGINS` env var on Render:

1. Render dashboard → `harley-api` → **Environment**.
2. Edit `CORS_ORIGINS`:
   ```
   https://harley-buyer.vercel.app,https://harley-dealer.vercel.app,https://harley-admin.vercel.app
   ```
   (No spaces, comma-separated. Add custom domains later if you wire them up.)
3. **Save & Deploy** — Render restarts the API with the new origin list (~30 s).

---

## Part 3 — Smoke test

Hit each surface and confirm:

| URL | What to check |
|---|---|
| `https://harley-buyer.vercel.app/` | Hero loads, Search Stock returns ~50 bikes from 15 dealers |
| `https://harley-buyer.vercel.app/search` | Filter sidebar updates results live |
| `https://harley-buyer.vercel.app/listings/<slug>` | Detail page + "Visit Dealer" opens enquiry modal |
| `https://harley-buyer.vercel.app` (click "Sell Your Bike") | Sell-bike popup → fill → Send Enquiry → OTP modal → verify |
| `https://harley-dealer.vercel.app/login` | Login as `gurgaon-hd` / `Dealer@123!` → dashboard |
| `https://harley-admin.vercel.app/login` | Login as `admin@hd-cpo.local` / `Admin@123!` → Listings/Enquiries pages |
| `https://harley-api.onrender.com/api/docs` | Swagger UI lists every endpoint |

---

## Part 4 — Production hardening (do these before real users)

### Switch off mocks
1. **OTP**: provision MSG91 (or Twilio), set `SMS_PROVIDER=msg91`, `MSG91_AUTH_KEY=…` etc. on Render.
2. **Email**: provision SendGrid, set `EMAIL_PROVIDER=sendgrid`, `SENDGRID_API_KEY=…`, `EMAIL_FROM=noreply@hd-certified.in`.
3. **Torque DMS**: once the upstream API is available, set `TORQUE_MODE=live`, `TORQUE_BASE_URL=…`, `TORQUE_API_KEY=…`.

### Rotate seeded credentials
Login as admin → change password. Same for the seeded dealer accounts.

### Move off free tiers
- **Postgres**: free tier expires in 90 days. Bump to `basic-256mb` ($7/mo) before then via Render dashboard.
- **API**: free web service sleeps after 15 min idle. Bump to `starter` ($7/mo) for always-on (cold start ~30 s otherwise).
- **Redis**: free tier OK for early traffic; upgrade when OTP volume warrants.

### Custom domain
1. Render → `harley-api` → **Settings** → **Custom Domain** → add `api.hd-certified.in` (or chosen).
2. Vercel → each project → **Settings** → **Domains** → add `hd-certified.in`, `dealer.hd-certified.in`, `admin.hd-certified.in`.
3. Update each Vercel project's `VITE_API_URL` to point at `https://api.hd-certified.in`.
4. Update Render's `CORS_ORIGINS` to use the apex domains.

### Wire Sentry
1. Create a Sentry project for the API; set `SENTRY_DSN` on Render.
2. Create a Sentry project for the buyer SPA; set `VITE_SENTRY_DSN` on Vercel buyer project. Repeat for dealer + admin.

### Backups
Render auto-backs up Postgres daily on starter+ plans. On free, take a manual `pg_dump` weekly until you upgrade.

---

## Rolling back

Both platforms have one-click rollback in the dashboard:
- **Vercel**: Deployments tab → previous successful deploy → **Promote to Production**.
- **Render**: Events tab → previous deploy → **Rollback**.

For the API, a rollback also re-runs `prisma:deploy` against any newer schema, which can fail if you've shipped a destructive migration. Always test schema changes on a staging branch first.

---

## Trouble­shooting

**Frontend build fails on Vercel** with a workspace dependency error.
→ Vercel must run the install + build from the **monorepo root**. The `vercel.json` files use `cd ../..` to do this. If you forked the repo without `pnpm-workspace.yaml`, restore it.

**API responds 502** for the first request after idle.
→ Free tier cold start. Bump to `starter` plan or hit `/api/v1/health/ready` from a cron-style pinger.

**CORS errors in the browser console.**
→ Render `CORS_ORIGINS` env doesn't list your exact Vercel URL. Update + redeploy.

**Frontend logs in but API returns 401 on subsequent calls.**
→ Cookies aren't shared across separate domains. The API uses Bearer tokens (not cookies), so check that the Authorization header is being sent. The api client does this automatically.

**Postgres connection limits on free tier.**
→ Free Postgres has 97 max connections. Render serverless functions can blow through that. If you see `too many clients already`, switch to `basic-256mb` ($7/mo) for 256 connections.
