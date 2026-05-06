import { defineConfig, searchForWorkspaceRoot } from 'vite';
import react from '@vitejs/plugin-react';

// The dealer app is served under the `/dealer` path prefix on
// harleydavidson.ciadmin.in (Apache reverse-proxies /dealer/ → :5181).
// `base` makes Vite emit asset URLs as /dealer/assets/… so the proxied
// browser request lands back on this Vite server, not on the buyer.
//
// Local dev: visit http://localhost:5181/dealer/ (the bare /
// will redirect there). The Apache proxy on the server passes the
// /dealer/ prefix straight through, so the same `base` works in both
// environments.
export default defineConfig({
  base: '/dealer/',
  plugins: [react()],
  server: {
    port: 5181,
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
    // HMR over the public HTTPS domain — Apache must have mod_proxy_wstunnel
    // loaded for this to work end-to-end. If it doesn't, the app still loads
    // fine via full page reloads; you'll just lose hot-module updates.
    hmr: {
      protocol: 'wss',
      host: 'harleydavidson.ciadmin.in',
      clientPort: 443,
      path: '/dealer/',
    },
    proxy: {
      '/api': { target: 'http://localhost:4001', changeOrigin: true },
    },
  },
});
