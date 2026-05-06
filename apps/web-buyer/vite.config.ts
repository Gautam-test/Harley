import { defineConfig, searchForWorkspaceRoot } from 'vite';
import react from '@vitejs/plugin-react';

// Buyer app is the apex / root SPA on harleydavidson.ciadmin.in. Apache's
// catch-all `ProxyPass /` rule routes everything that isn't /api, /dealer,
// /admin, or a Vite-internal path here.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    host: true,
    allowedHosts: [
      'localhost',
      '.localhost',
      'harleydavidson.ciadmin.in',
      '.ciadmin.in',
    ],
    fs: {
      allow: [searchForWorkspaceRoot(process.cwd())],
    },
    // HMR over the public HTTPS domain — needs mod_proxy_wstunnel on Apache.
    // Falls back to full page reloads if the websocket can't upgrade.
    hmr: {
      protocol: 'wss',
      host: 'harleydavidson.ciadmin.in',
      clientPort: 443,
    },
    proxy: {
      '/api': { target: 'http://localhost:4001', changeOrigin: true },
      '/sitemap.xml': { target: 'http://localhost:4001', changeOrigin: true },
      '/robots.txt': { target: 'http://localhost:4001', changeOrigin: true },
    },
  },
});
