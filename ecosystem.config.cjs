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
      restart_delay: 3000,
      max_restarts: 10,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
      merge_logs: true,
    },
    {
      // Webhook listener — triggers auto-deploy on every git push to main.
      // GitLab → Settings → Webhooks → http://SERVER_IP:9000/deploy
      // Set WEBHOOK_SECRET in env to match GitLab secret token.
      name: 'hd-cpo-webhook',
      script: './scripts/webhook-server.mjs',
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
        WEBHOOK_PORT: '9000',
        WEBHOOK_SECRET: 'hd-cpo-deploy-secret',  // Change this!
      },
      restart_delay: 3000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/webhook-error.log',
      out_file: './logs/webhook-out.log',
      merge_logs: true,
    },
  ],
};
