#!/bin/bash
# ─────────────────────────────────────────────────────────────────────
# H-D CPO — One-time server setup for fully automatic git-push deploy.
#
# Run ONCE on the server (as the harley user) from inside the repo:
#   cd /var/www/html/harleydavidson.ciadmin.in/harley-node
#   bash scripts/setup-auto-deploy.sh
#
# After this:
#   - Every `git push` triggers GitLab webhook → server pulls + rebuilds
#     + migrates + regenerates Prisma client + restarts API automatically.
#   - You never have to SSH into the server again for routine deploys.
# ─────────────────────────────────────────────────────────────────────

set -e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  H-D CPO Auto-Deploy Setup"
echo "  Repo: $REPO_DIR"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. Ensure PM2 is installed
if ! command -v pm2 >/dev/null 2>&1; then
  echo "→ Installing PM2 globally…"
  npm install -g pm2
fi

# 2. Make deploy script executable
chmod +x "$REPO_DIR/scripts/deploy.sh" 2>/dev/null || true

# 3. Start (or reload) the webhook listener via PM2 ecosystem
echo "→ Starting webhook listener (PM2)…"
pm2 startOrReload ecosystem.config.cjs --update-env

# 4. Save PM2 state so it survives reboots
pm2 save

# 5. Set up PM2 startup so the webhook + API restart automatically on
#    server reboot (sudo prompt may appear once).
pm2 startup systemd -u "$USER" --hp "$HOME" 2>&1 | tail -5

echo ""
echo "✅ Setup complete!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Now configure GitLab webhook:"
echo "  ─────────────────────────────"
echo "    1. Go to your project → Settings → Webhooks"
echo "    2. URL:           http://$(curl -s ifconfig.me 2>/dev/null || echo YOUR_SERVER_IP):9000/deploy"
echo "    3. Secret Token:  hd-cpo-deploy-secret"
echo "    4. Trigger:       ✓ Push events"
echo "    5. Branch filter: main"
echo "    6. Click 'Add webhook'"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "After webhook is added, every git push to main will trigger:"
echo "  git pull → pnpm install → prisma:deploy → prisma:generate → pnpm build → pm2 restart"
echo ""
echo "Check webhook receiver logs anytime: pm2 logs hd-cpo-webhook"
echo "Check deploy logs anytime:           cat $REPO_DIR/logs/deploy.log"
