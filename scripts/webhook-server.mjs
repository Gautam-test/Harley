/**
 * H-D CPO — GitLab Webhook Listener
 *
 * Server pe ek baar start karo:
 *   node scripts/webhook-server.mjs
 *   ya PM2 se: pm2 start scripts/webhook-server.mjs --name hd-cpo-webhook
 *
 * GitLab pe setup:
 *   Settings → Webhooks → URL: http://YOUR_SERVER_IP:9000/deploy
 *   Secret Token: jo bhi WEBHOOK_SECRET env me set karo
 *   Trigger: Push events → main branch
 */

import http from 'http';
import { exec } from 'child_process';
import { createHmac } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const PORT = process.env.WEBHOOK_PORT || 9000;
const SECRET = process.env.WEBHOOK_SECRET || 'hd-cpo-deploy-secret';

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/deploy') {
    res.writeHead(404).end('Not found');
    return;
  }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    // Verify GitLab secret token
    const token = req.headers['x-gitlab-token'];
    if (token !== SECRET) {
      console.log('[Webhook] ❌ Invalid secret token');
      res.writeHead(401).end('Unauthorized');
      return;
    }

    // Only deploy on push to main branch
    try {
      const payload = JSON.parse(body);
      if (payload.ref !== 'refs/heads/main') {
        console.log(`[Webhook] Skipping — branch: ${payload.ref}`);
        res.writeHead(200).end('Skipped — not main branch');
        return;
      }
    } catch {
      res.writeHead(400).end('Invalid payload');
      return;
    }

    console.log('[Webhook] ✅ Push to main received — starting deploy...');
    res.writeHead(200).end('Deploy started');

    // Run deploy script
    const cmd = `cd ${REPO_ROOT} && bash scripts/deploy.sh >> logs/deploy.log 2>&1`;
    exec(cmd, (err, stdout, stderr) => {
      if (err) {
        console.error('[Webhook] ❌ Deploy failed:', err.message);
      } else {
        console.log('[Webhook] ✅ Deploy complete!');
      }
    });
  });
});

server.listen(PORT, () => {
  console.log(`[Webhook] Listening on port ${PORT}`);
  console.log(`[Webhook] URL: http://YOUR_SERVER_IP:${PORT}/deploy`);
});
