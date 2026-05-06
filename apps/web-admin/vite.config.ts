import { defineConfig, searchForWorkspaceRoot } from 'vite';
import react from '@vitejs/plugin-react';

// Admin app served under the /admin path prefix on
// harleydavidson.ciadmin.in (Apache reverse-proxies /admin/ → :5182).
// See web-dealer/vite.config.ts for the long explanation; this file
// applies the same pattern with /admin/ instead of /dealer/.
export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  server: {
    port: 5182,
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
    hmr: {
      protocol: 'wss',
      host: 'harleydavidson.ciadmin.in',
      clientPort: 443,
      path: '/admin/',
    },
    proxy: {
      '/api': { target: 'http://localhost:4001', changeOrigin: true },
    },
  },
});
