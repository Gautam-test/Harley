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

# 4. Build API
echo "→ Building API..."
pnpm --filter @hd-cpo/api build

# 5. Build frontend SPAs
echo "→ Building buyer portal..."
pnpm --filter @hd-cpo/web-buyer build

echo "→ Building dealer portal..."
pnpm --filter @hd-cpo/web-dealer build

echo "→ Building admin portal..."
pnpm --filter @hd-cpo/web-admin build

# 6. Reload API with PM2 (zero-downtime)
echo "→ Reloading API with PM2..."
pm2 reload ecosystem.config.cjs --update-env

echo ""
echo "✅ Deploy complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
