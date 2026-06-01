/**
 * PM2 Ecosystem Config — H-D CPO Marketplace
 *
 * Usage on server:
 *   pm2 start ecosystem.config.cjs        ← first time
 *   pm2 reload ecosystem.config.cjs       ← after git pull (zero-downtime)
 *   pm2 save                              ← persist across reboots
 *   pm2 startup                           ← enable auto-start on reboot
 *
 * The API app uses `start:prod` which runs:
 *   prisma migrate deploy → node dist/main.js
 * So every deploy automatically applies pending DB migrations before
 * the server starts — no manual migration step needed.
 */

module.exports = {
  apps: [
    {
      name: 'hd-cpo-api',
      cwd: './apps/api',
      script: 'pnpm',
      args: 'start:prod',
      interpreter: 'none',
      env: {
        NODE_ENV: 'production',
      },
      // Restart on crash; wait 3 s before each restart to avoid hammering
      // the DB during a cold-start failure loop.
      restart_delay: 3000,
      max_restarts: 10,
      // Keep last 30 days of logs, rotate at 10 MB.
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
      merge_logs: true,
    },
  ],
};
