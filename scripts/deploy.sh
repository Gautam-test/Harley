#!/bin/bash
# ─────────────────────────────────────────────────────────────
# H-D CPO — Auto Deploy Script
# Run on server after git pull OR via git post-receive hook.
#
# Setup (one time on server):
#   chmod +x scripts/deploy.sh
#   ln -s /path/to/repo/scripts/deploy.sh /path/to/git/hooks/post-receive
# ─────────────────────────────────────────────────────────────

set -e  # Stop on any error

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  H-D CPO Deploy — $(date '+%Y-%m-%d %H:%M:%S')"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. Pull latest code
echo "→ Pulling latest code..."
git pull origin main

# 2. Install dependencies
echo "→ Installing dependencies..."
pnpm install --frozen-lockfile

# 3. Run DB migrations (safe — skips already-applied migrations)
echo "→ Running DB migrations..."
pnpm --filter @hd-cpo/api prisma:deploy

# 3b. Regenerate Prisma client so new columns are queryable by the
# generated TS client. Skipping this is what caused the
# "Unknown argument registrationNumber" error after migration
# 20260602000000 and the missing internal-pricing fields on edit.
echo "→ Regenerating Prisma client..."
pnpm --filter @hd-cpo/api prisma:generate

# 3c. Seed the 13 extra dealers (Bengaluru … Dehradun) from
# seed-extra.ts. The script is fully idempotent — every dealer row
# is `prisma.dealer.upsert({where:{username:slug}, ...})` and listing
# rows are keyed by deterministic VINs — so re-running on every
# deploy is safe.
#
# Without this step the prod DB only contains the 2 dealers in the
# main seed.ts (Gurgaon + Mumbai). Login attempts for any of the
# other 13 emails (sales@bengaluru-hd.example.in etc.) hit the
# generic INVALID_CREDENTIALS branch and the dealer can't sign in.
# Setting SEED_EXTRA=0 disables the step if the QA team ever needs
# a clean 2-dealer environment.
if [ "${SEED_EXTRA:-1}" = "1" ]; then
  echo "→ Seeding extra dealers + listings (idempotent upsert)..."
  # `|| true` — seed-extra is non-critical and has been observed to
  # fail with P2002 when a dealer email collides with a manually-edited
  # row. Without this guard, `set -e` killed deploy.sh before the API
  # build step, so every API code change silently failed to deploy
  # (frontend looked fine because Vite serves source directly).
  pnpm --filter @hd-cpo/api prisma:seed-extra || echo "⚠ seed-extra skipped (non-fatal)"
fi

# 4. Build the shared workspace packages (types, torque-client, etc).
# API build alone fails because dist/main.js imports @hd-cpo/types
# from .ts source files that node can't resolve directly.
#
# QA: wipe each package's dist + tsbuildinfo BEFORE the build so tsc's
# incremental cache can't silently skip a source change (was the
# "git pull happened, code unchanged in dist" symptom). Done sequentially
# here — moving the rm into each package's build script causes pnpm -r
# to race the cleanups against the api's symlink resolution.
echo "→ Wiping stale build artifacts..."
# Match both the legacy `tsconfig.tsbuildinfo` (if any old config emitted
# it) AND the actual `tsconfig.build.tsbuildinfo` produced by our
# tsconfig.build.json — the latter was the cache that silently skipped
# rebuilds after a `git pull` of changed source.
rm -rf packages/types/dist packages/types/tsconfig*.tsbuildinfo
rm -rf packages/torque-client/dist packages/torque-client/tsconfig*.tsbuildinfo
rm -rf apps/api/dist apps/api/tsconfig*.tsbuildinfo

echo "→ Building shared packages + API..."
pnpm -r --filter "@hd-cpo/types" --filter "@hd-cpo/torque-client" --filter "@hd-cpo/api" build

# 5. Build frontend SPAs
echo "→ Building buyer portal..."
pnpm --filter @hd-cpo/web-buyer build

echo "→ Building dealer portal..."
pnpm --filter @hd-cpo/web-dealer build

echo "→ Building admin portal..."
pnpm --filter @hd-cpo/web-admin build

# 6a. Kill any orphan API processes that exist outside ecosystem.config.cjs
# (`harley-api` was started manually before the config existed and is
# still occupying PM2 state). The `|| true` keeps deploy.sh going even
# if the process isn't present.
echo "→ Removing orphan API processes (if any)..."
pm2 delete harley-api 2>/dev/null || true
pm2 delete hd-cpo-a 2>/dev/null || true

# 6b. Restart API with PM2 (full kill + respawn, not graceful reload)
# `pm2 reload` is graceful (zero-downtime) BUT in fork mode it doesn't
# always recycle Node's module cache cleanly — observed symptom: after
# a torque-mock rebuild, the running API kept serving the previous
# mock output. `pm2 restart` does a hard SIGKILL + respawn which loads
# the fresh dist files unconditionally. Brief (~1s) downtime is fine
# for a non-cluster API.
echo "→ Restarting API with PM2..."
pm2 restart ecosystem.config.cjs --update-env

echo ""
echo "✅ Deploy complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
